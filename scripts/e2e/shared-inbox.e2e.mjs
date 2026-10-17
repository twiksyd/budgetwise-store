// End-to-end test of the shared admin inbox and customer chat against a
// LOCAL Supabase stack (supabase start) and a local Next.js server.
//
//   E2E_BASE_URL=http://127.0.0.1:3100 \
//   E2E_SUPABASE_SERVICE_ROLE_KEY=<local service key> \
//   node --test scripts/e2e/shared-inbox.e2e.mjs
//
// Three admins (Robert, Andre, Kenneth) and two customers each get their
// own browser context, exactly like separate people on separate devices.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright-core";
import { PASSWORD, USERS, seed } from "./seed-local.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const ORDER_A = "BW-E2EAAA";
const ORDER_B = "BW-E2EBBB";
const T = { timeout: 30_000 };

let browser;
const people = {};
let ids;

async function signIn(key, { viewport }) {
  const context = await browser.newContext({ baseURL: BASE, viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(USERS[key].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Customers bounce off admin with a session cookie set — that is all we need.
  await page.waitForURL((url) => !url.pathname.endsWith("/admin/login") || url.search.includes("denied"), T);
  return { context, page };
}

async function api(page, path, init) {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, init);
      const text = await response.text();
      return { status: response.status, text, location: response.headers.get("location") };
    },
    { path, init },
  );
}

function rowFor(page, orderNumber) {
  return page.locator(`a[href="/admin/orders/${orderNumber}"]`);
}

before(async () => {
  ids = await seed();
  browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  const desktop = { width: 1440, height: 900 };
  for (const key of ["robert", "andre", "kenneth"]) people[key] = await signIn(key, { viewport: desktop });
  people.custa = await signIn("custa", { viewport: { width: 390, height: 844 } });
  people.custb = await signIn("custb", { viewport: { width: 390, height: 844 } });
});

after(async () => {
  await browser?.close();
});

describe("shared inbox, three admins + customers, real realtime", { concurrency: false }, () => {
  test("every admin sees the inbox and a real Live connection", async () => {
    for (const key of ["robert", "andre", "kenneth"]) {
      const { page } = people[key];
      await page.goto("/admin/orders");
      await rowFor(page, ORDER_A).waitFor(T);
      await page.getByRole("status").filter({ hasText: "Live" }).first().waitFor(T);
    }
  });

  test("customer page: chat, Live badge, gamepass link card for the Via Link item", async () => {
    const { page } = people.custa;
    await page.goto(`/orders/${ORDER_A}`);
    await page.getByText("Order slip").first().waitFor(T);
    await page.getByRole("status").filter({ hasText: "Live" }).waitFor(T);
    await page.getByRole("heading", { name: "Gamepass Link" }).waitFor(T);
  });

  test("customer message reaches every admin inbox without refresh (moves to top, unread +1)", async () => {
    // The order slip is already one unread customer message; this makes two.
    await people.custa.page.getByLabel("Message", { exact: true }).fill("Hello po, may tanong ako");
    await people.custa.page.getByLabel("Message", { exact: true }).press("Enter");
    for (const key of ["robert", "andre", "kenneth"]) {
      const row = rowFor(people[key].page, ORDER_A);
      await row.getByText("Hello po, may tanong ako").waitFor(T);
      await row.getByText(/^2$/).waitFor(T);
      const first = people[key].page.locator('a[href^="/admin/orders/BW-"]').first();
      assert.equal(await first.getAttribute("href"), `/admin/orders/${ORDER_A}`);
    }
  });

  test("a brand-new conversation appears in the inbox without refresh", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient("http://127.0.0.1:54321", process.env.E2E_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const line = {
      user_id: null, gamepass_id: crypto.randomUUID(), game_id: "33333333-3333-3333-3333-333333333333",
      product_name: "Storage", game_name: "Grow a Garden", robux_amount: 100, quantity: 2, unit_price: 50,
      line_total: 100, is_via_plus: false, line_robux_amount: 200, line_cost: 0, line_profit: 100,
    };
    const orderNumber = `BW-E2E${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const { error } = await service.rpc("create_store_order", {
      p_idempotency_key: `e2e-idempotency-${orderNumber}-yyyyyyyy`, p_request_fingerprint: "c".repeat(64),
      p_view_token_hash: "d".repeat(64), p_order_number: orderNumber, p_buyer_name: "Kenji New",
      p_buyer_roblox_username: "kenjiRBX", p_total_amount: 100, p_lines: [line], p_via_plus: null,
    });
    assert.equal(error, null);
    await service.from("store_order_snapshots").update({ owner_user_id: ids.custb }).eq("order_number", orderNumber);
    await service.from("store_order_messages").insert({ order_number: orderNumber, sender_role: "customer", sender_user_id: ids.custb, kind: "slip", body: "ORDER SLIP" });
    for (const key of ["robert", "andre", "kenneth"]) {
      await rowFor(people[key].page, orderNumber).getByText("Kenji New").waitFor(T);
    }
  });

  test("Robert opens the chat: instant open, items in the right panel from order records", async () => {
    const { page } = people.robert;
    await rowFor(page, ORDER_A).click();
    await page.waitForURL(`**/admin/orders/${ORDER_A}`);
    await page.getByText("Hello po, may tanong ako").waitFor(T);
    const panel = page.getByRole("complementary", { name: "Order details" });
    await panel.getByText("Juan123").waitFor(T);
    await panel.getByText("Blox Fruits").waitFor(T);
    await panel.getByText("Robux (Via Link)").waitFor(T);
    await panel.getByText("Mastery").waitFor(T);
    await panel.getByText("Waiting for customer").waitFor(T);
    await panel.getByText("₱1,500").first().waitFor(T);
  });

  test("per-admin unread: Robert reading does not clear Andre's or Kenneth's badge", async () => {
    await rowFor(people.robert.page, ORDER_A).getByText(/^2$/).waitFor({ state: "detached", timeout: 30_000 });
    await people.andre.page.waitForTimeout(1500);
    assert.equal(await rowFor(people.andre.page, ORDER_A).getByText(/^2$/).count(), 1, "Andre still has 2 unread");
    assert.equal(await rowFor(people.kenneth.page, ORDER_A).getByText(/^2$/).count(), 1, "Kenneth still has 2 unread");
  });

  test("presence: Andre opens the same chat and Robert sees 'Andre is viewing'; typing shows instantly", async () => {
    await rowFor(people.andre.page, ORDER_A).click();
    await people.andre.page.waitForURL(`**/admin/orders/${ORDER_A}`);
    await people.robert.page.getByText("Andre is viewing").first().waitFor(T);
    await people.andre.page.getByText("Robert is viewing").first().waitFor(T);
    await people.kenneth.page.getByText(/Andre and Robert are viewing|Robert and Andre are viewing/).first().waitFor(T);

    await people.andre.page.getByLabel("Message", { exact: true }).pressSequentially("typing something", { delay: 30 });
    await people.robert.page.getByText("Andre is typing").first().waitFor(T);
    await people.andre.page.getByLabel("Message", { exact: true }).fill("");
  });

  test("signals cannot impersonate: Kenneth sending Robert's id still shows as Kenneth", async () => {
    const result = await api(people.kenneth.page, "/api/admin/inbox/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "typing", orderNumber: ORDER_A, admin_user_id: ids.robert, display_name: "Robert" }),
    });
    assert.equal(result.status, 202);
    await people.andre.page.getByText("Kenneth is typing").first().waitFor(T);
    const customerSignal = await api(people.custa.page, "/api/admin/inbox/signal", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "typing", orderNumber: ORDER_A }),
    });
    assert.equal(customerSignal.status, 401, "customers cannot publish admin signals");
  });

  test("Robert's reply: Andre sees 'Sent by Robert', the customer sees only 'BudgetWise'", async () => {
    await people.robert.page.getByLabel("Message", { exact: true }).fill("Hi po! Checking your order now.");
    await people.robert.page.getByLabel("Message", { exact: true }).press("Enter");
    await people.andre.page.getByText("Hi po! Checking your order now.").waitFor(T);
    await people.andre.page.getByText("Sent by Robert").first().waitFor(T);
    await people.custa.page.getByText("Hi po! Checking your order now.").waitFor(T);
    const customerPage = await people.custa.page.locator("body").innerText();
    for (const name of ["Robert", "Andre", "Kenneth", "Sent by"]) {
      assert.equal(customerPage.includes(name), false, `customer never sees "${name}"`);
    }
    await people.custa.page.getByText("BudgetWise").first().waitFor(T);
  });

  test("seen: the customer reading shows 'Seen' to the admins", async () => {
    await people.robert.page.getByText("Seen").first().waitFor(T);
  });

  test("assignment syncs to every admin instantly", async () => {
    await people.andre.page.getByRole("complementary", { name: "Order details" }).locator("select").selectOption(ids.robert);
    await rowFor(people.kenneth.page, ORDER_A).getByText("Robert").waitFor(T);
    await rowFor(people.robert.page, ORDER_A).getByText("You").waitFor(T);
    await people.kenneth.page.goto(`/admin/orders/${ORDER_A}`);
    await people.kenneth.page.getByText("Robert is currently handling this conversation.").waitFor(T);
  });

  test("quick reply: /was inserts (does not send) and is editable", async () => {
    const created = await api(people.robert.page, "/api/admin/quick-replies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut: "WAS", title: "Payment received", body: "Payment received po, {{customer_name}}! Kindly accept my friend request.", isEnabled: true }),
    });
    assert.equal(created.status, 201);
    assert.match(created.text, /"shortcut":"was"/);
    const forbidden = await api(people.custa.page, "/api/admin/quick-replies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut: "hack", title: "x", body: "x" }),
    });
    assert.equal(forbidden.status, 403, "non-admins cannot manage quick replies");

    const { page } = people.robert;
    await page.waitForTimeout(1500); // realtime "quick_replies" ping refreshes the list
    const box = page.getByLabel("Message", { exact: true });
    const before = await page.locator("[data-message-id]").count();
    await box.fill("");
    await box.pressSequentially("/wa");
    await page.getByRole("listbox", { name: "Saved replies" }).waitFor(T);
    await box.press("Enter");
    assert.equal(await box.inputValue(), "Payment received po, Juan Dela Cruz! Kindly accept my friend request.");
    await page.waitForTimeout(800);
    assert.equal(await page.locator("[data-message-id]").count(), before, "inserting never sends");
    await box.fill("");
  });

  test("payment details: preview, send, customer gets the card; QR only for the owner", async () => {
    const { page } = people.robert;
    await page.getByRole("button", { name: "Send payment details" }).click();
    await page.getByRole("button", { name: "Send to customer" }).click();
    const card = people.custa.page.getByText("GCash Payment");
    await card.waitFor(T);
    await people.custa.page.getByText("09171234567").first().waitFor(T);
    await people.custa.page.getByText("Payment details sent").waitFor(T);

    const messages = await api(people.custa.page, `/api/order-chat/${ORDER_A}/messages?as=customer`, {});
    assert.equal(messages.status, 200);
    for (const forbidden of ["qr_path", "qr/", "sender_user_id", "senderUserId", ids.robert, "attachment_path", "method_id"]) {
      assert.equal(messages.text.includes(forbidden), false, `customer JSON must not include ${forbidden}`);
    }
    const payment = JSON.parse(messages.text).messages.find((m) => m.kind === "payment");
    assert.deepEqual(Object.keys(payment.payment).sort(), ["accountName", "accountNumber", "amount", "currency", "hasQr", "label", "provider"]);
    assert.equal(payment.payment.amount, 1500);

    const qrUrl = `/api/order-chat/${ORDER_A}/payment-qr/${payment.id}`;
    const owner = await people.custa.page.request.get(qrUrl, { maxRedirects: 0 });
    assert.equal(owner.status(), 302);
    assert.match(owner.headers().location, /store-payment-qr\/.+token=/);
    const other = await people.custb.page.request.get(qrUrl, { maxRedirects: 0 });
    assert.equal(other.status(), 404, "customer B cannot open A's QR");
    const viaOtherOrder = await people.custb.page.request.get(`/api/order-chat/${ORDER_B}/payment-qr/${payment.id}`, { maxRedirects: 0 });
    assert.equal(viaOtherOrder.status(), 404, "A's payment message cannot be reached through B's order");
  });

  test("gamepass link: customer saves it structurally; Robert's panel updates live", async () => {
    const { page } = people.custa;
    await page.getByLabel(/Gamepass link for/).fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save link" }).click();
    await page.getByRole("alert").filter({ hasText: "Paste the link" }).waitFor(T);
    await page.getByLabel(/Gamepass link for/).fill("roblox.com/game-pass/123456789/My-Pass?ref=x");
    await page.getByRole("button", { name: "Save link" }).click();
    await page.getByText("https://www.roblox.com/game-pass/123456789").waitFor(T);
    const panel = people.robert.page.getByRole("complementary", { name: "Order details" });
    await panel.getByText("https://www.roblox.com/game-pass/123456789").waitFor(T);
    await panel.getByText("From customer").waitFor(T);

    const intrusion = await api(people.custb.page, `/api/order-chat/${ORDER_A}/fulfillment`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIndex: 2, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/1" }),
    });
    assert.equal(intrusion.status, 404, "customer B cannot edit A's fulfillment details");
    const read = await api(people.custb.page, `/api/order-chat/${ORDER_A}/fulfillment`, {});
    assert.equal(read.status, 404, "customer B cannot read A's fulfillment details");
  });

  test("admin correction is audited", async () => {
    const result = await api(people.andre.page, `/api/admin/orders/${ORDER_A}/fulfillment`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIndex: 2, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/987654321" }),
    });
    assert.equal(result.status, 200);
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
    await client.connect();
    const { rows } = await client.query(
      "select actor_user_id, details from store_chat_audit_log where action = 'fulfillment_detail.corrected' order by id desc limit 1",
    );
    await client.end();
    assert.equal(rows[0].actor_user_id, ids.andre);
    assert.equal(rows[0].details.before, "https://www.roblox.com/game-pass/123456789");
    assert.equal(rows[0].details.after, "https://www.roblox.com/game-pass/987654321");
    const customerTry = await api(people.custa.page, `/api/admin/orders/${ORDER_A}/fulfillment`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIndex: 2, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/5" }),
    });
    assert.equal(customerTry.status, 403, "customers cannot use the admin correction endpoint");
  });

  test("receipt upload: customer attaches a PNG; admins see it; other customers cannot open it", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const { page } = people.custa;
    await page.locator('input[type="file"]').setInputFiles({ name: "gcash-receipt.png", mimeType: "image/png", buffer: png });
    await page.getByAltText("Selected image").waitFor(T);
    await page.getByRole("button", { name: "Send message" }).click();
    await people.robert.page.getByAltText("Sent image").first().waitFor(T);
    const latest = JSON.parse((await api(page, `/api/order-chat/${ORDER_A}/messages?as=customer`, {})).text).messages.filter((m) => m.kind === "image").pop();
    const own = await page.request.get(`/api/order-chat/attachments/${latest.id}`, { maxRedirects: 0 });
    assert.equal(own.status(), 302);
    const other = await people.custb.page.request.get(`/api/order-chat/attachments/${latest.id}`, { maxRedirects: 0 });
    assert.equal(other.status(), 404, "customer B cannot open A's receipt");

    const fake = await api(page, `/api/order-chat/${ORDER_A}/messages?as=customer`, {
      method: "POST",
      body: (() => { const f = new FormData(); f.set("body", ""); f.set("file", new File(["<svg onload=alert(1)>"], "x.png", { type: "image/png" })); return f; })(),
    });
    assert.notEqual(fake.status, 201, "a non-image disguised as PNG is rejected");
  });

  test("customer isolation and admin-only APIs", async () => {
    const page = people.custb.page;
    assert.equal((await page.request.get(`/orders/${ORDER_A}`)).status(), 404, "B cannot open A's order page");
    assert.equal((await api(page, `/api/order-chat/${ORDER_A}/messages?as=customer`, {})).status, 404);
    assert.equal((await api(page, `/api/order-chat/${ORDER_A}/messages?as=admin`, {})).status, 403, "customer cannot act as admin");
    assert.equal((await api(page, "/api/admin/inbox", {})).status, 403);
    assert.equal((await api(page, `/api/admin/orders/${ORDER_A}/details`, {})).status, 403);
    const assign = await api(page, `/api/admin/orders/${ORDER_A}/assign`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigneeId: ids.custb }),
    });
    assert.equal(assign.status, 403, "customer cannot assign chats");
    const forged = await api(page, `/api/order-chat/${ORDER_B}/messages?as=customer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "<script>alert(1)</script>", clientMessageId: crypto.randomUUID(), sender_role: "admin", sender_user_id: ids.robert }),
    });
    assert.equal(forged.status, 201);
    const stored = JSON.parse(forged.text).message;
    assert.equal(stored.senderRole, "customer", "sender role comes from the session, not the body");
  });

  test("duplicate message ids never create duplicates", async () => {
    const clientMessageId = crypto.randomUUID();
    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "retry-me-once", clientMessageId }) };
    const first = await api(people.custa.page, `/api/order-chat/${ORDER_A}/messages?as=customer`, init);
    const second = await api(people.custa.page, `/api/order-chat/${ORDER_A}/messages?as=customer`, init);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(JSON.parse(first.text).message.id, JSON.parse(second.text).message.id);
    const reuse = await api(people.custa.page, `/api/order-chat/${ORDER_A}/messages?as=customer`, {
      ...init, body: JSON.stringify({ body: "different text", clientMessageId }),
    });
    assert.equal(reuse.status, 409);
    await people.robert.page.waitForTimeout(1500);
    assert.equal(await people.robert.page.getByText("retry-me-once").count(), 1, "admins see it exactly once");
  });

  test("offline then back: badge shows Offline, then Live, and missed messages arrive", async () => {
    const { context, page } = people.custa;
    await context.setOffline(true);
    await page.getByRole("status").filter({ hasText: "Offline" }).waitFor(T);
    await people.robert.page.getByLabel("Message", { exact: true }).fill("Sent while you were offline");
    await people.robert.page.getByLabel("Message", { exact: true }).press("Enter");
    await people.robert.page.getByText("Sent while you were offline").waitFor(T);
    await context.setOffline(false);
    await page.getByText("Sent while you were offline").waitFor({ timeout: 45_000 });
    await page.getByRole("status").filter({ hasText: "Live" }).waitFor({ timeout: 45_000 });
  });

  test("new-message pill when scrolled up", async () => {
    const { page } = people.robert;
    for (let i = 0; i < 12; i += 1) {
      await api(people.custa.page, `/api/order-chat/${ORDER_A}/messages?as=customer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: `filler ${i}`, clientMessageId: crypto.randomUUID() }),
      });
    }
    await page.getByText("filler 11").waitFor(T);
    await page.locator('[role="log"]').first().evaluate((node) => node.scrollTo({ top: 0 }));
    await page.waitForTimeout(600);
    await api(people.custa.page, `/api/order-chat/${ORDER_A}/messages?as=customer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "arrived while scrolled up", clientMessageId: crypto.randomUUID() }),
    });
    await page.getByRole("button", { name: /1 new message/ }).waitFor(T);
    await page.getByRole("button", { name: /1 new message/ }).click();
    await page.getByText("arrived while scrolled up").waitFor(T);
  });
});
