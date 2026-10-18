// Mobile customer experience, Done workflow and image albums, end to end
// against a LOCAL stack (supabase start + 0021/0022/0024) and a local
// Next.js server. Phones at 390x844 and 430x932, admins on desktop.
//
//   E2E_BASE_URL=http://127.0.0.1:3100 E2E_SUPABASE_SERVICE_ROLE_KEY=... \
//   node --test scripts/e2e/customer-messenger.e2e.mjs
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright-core";
import { PASSWORD, USERS, seed, seedCustomerScenarios } from "./seed-local.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const T = { timeout: 30_000 };
const PHONE = { width: 390, height: 844 };
const PHONE_LARGE = { width: 430, height: 932 };
const DESKTOP = { width: 1440, height: 900 };

let browser;
let ids;
const people = {};

// ---- tiny PNG encoder (test images of any size/colour, no dependencies)
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
export function makePng(width, height, [r, g, b]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    const shade = (x * 3) % 60;
    row[1 + x * 3] = Math.min(255, r + shade);
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const COLORS = [[124, 58, 237], [14, 165, 233], [22, 163, 74], [245, 158, 11], [225, 29, 72], [13, 148, 136]];
const images = (n, prefix = "proof") =>
  Array.from({ length: n }, (_, i) => ({
    name: `${prefix}-${i + 1}.png`,
    mimeType: "image/png",
    buffer: makePng(360 + (i % 3) * 120, 640 + (i % 2) * 200, COLORS[i % COLORS.length]),
  }));

async function signIn(key, viewport, { mobile = true } = {}) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport,
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    // The local stack has no catalog/store-settings tables; everything else counts.
    if (message.type() === "error" && !/store status|store_settings|store_games|store_gamepasses|Failed to load resource/.test(text)) {
      errors.push(text.slice(0, 200));
    }
  });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(USERS[key].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/admin/login") || url.search.includes("denied"), T);
  return { context, page, errors };
}

async function api(page, path, init) {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, init);
      return { status: response.status, text: await response.text() };
    },
    { path, init },
  );
}
const postJson = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function adminSays(orderNumber, text, who = "robert") {
  const result = await api(people[who].page, `/api/order-chat/${orderNumber}/messages?as=admin`, postJson({ body: text, clientMessageId: crypto.randomUUID() }));
  assert.equal(result.status, 201, result.text);
}

async function sql(query, params) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await client.connect();
  try {
    return (await client.query(query, params)).rows;
  } finally {
    await client.end();
  }
}

async function noHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.right > window.innerWidth + 1 && getComputedStyle(node).position !== "fixed";
      })
      .slice(0, 3)
      .map((node) => `${node.tagName}.${String(node.className).slice(0, 60)}`),
  }));
  assert.ok(result.scroll <= result.width, `${label}: page is ${result.scroll}px wide on a ${result.width}px screen (${result.offenders.join(", ")})`);
}

function floating(page) {
  return page.getByRole("button", { name: /^Message Us Now/ });
}
const chatLog = (page) => page.locator('[role="log"]').last();

before(async () => {
  ids = await seed();
  await seedCustomerScenarios(ids);
  browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  for (const key of ["robert", "andre", "kenneth"]) people[key] = await signIn(key, DESKTOP, { mobile: false });
  people.custa = await signIn("custa", PHONE);
  people.custc = await signIn("custc", PHONE);
  people.custb = await signIn("custb", PHONE);
});

after(async () => {
  await browser?.close();
});

describe("Part 1 — mobile customer experience", { concurrency: false }, () => {
  test("My Orders is visible in the header on a phone without opening the menu", async () => {
    const { page } = people.custc;
    await page.goto("/faq");
    const link = page.getByRole("link", { name: /^My Orders/ });
    await link.waitFor(T);
    const box = await link.boundingBox();
    assert.ok(box && box.y < 80 && box.height >= 36, "in the header, a real tap target");
    assert.equal(await page.getByRole("dialog").count(), 0, "no menu had to be opened");
    await link.click();
    await page.waitForURL("**/account/orders");
    await page.getByRole("heading", { name: "My Orders", exact: true }).first().waitFor(T);
  });

  test("long-term customer: unread first, then active, completed separated and paginated, fast", async () => {
    const { page } = people.custc;
    const t0 = Date.now();
    await page.goto("/account/orders");
    await page.getByText("Active orders").waitFor(T);
    const loadMs = Date.now() - t0;
    const active = page.locator('section[aria-labelledby="active-orders"] [data-order-card]');
    assert.deepEqual(await active.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-order-card"))), ["BW-LT024", "BW-LT023"]);
    await active.first().getByText("New reply").waitFor(T);
    const completed = page.locator('section[aria-labelledby="completed-orders"] [data-order-card]');
    assert.equal(await completed.count(), 20, "first 20 completed orders only");
    assert.equal(await completed.evaluateAll((nodes) => nodes.every((n) => n.getAttribute("data-state") === "done")), true);
    await completed.first().getByText("Completed").waitFor(T);
    await page.getByRole("button", { name: "Show older completed orders" }).click();
    await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby="completed-orders"] [data-order-card]').length === 23, null, T);
    const numbers = await completed.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-order-card")));
    assert.equal(new Set(numbers).size, 23, "no duplicates across pages");
    assert.ok(loadMs < 8000, `My Orders loaded in ${loadMs}ms`);
    await noHorizontalOverflow(page, "My Orders 390");
  });

  test("floating messages button: signed-in customers with orders only; first-time coachmark shows once", async () => {
    const visitor = await browser.newContext({ baseURL: BASE, viewport: PHONE, isMobile: true, hasTouch: true });
    const anon = await visitor.newPage();
    await anon.goto("/faq");
    await anon.waitForTimeout(1500);
    assert.equal(await floating(anon).count(), 0, "visitors get no messages button");
    await visitor.close();

    const { page } = people.custc;
    await page.evaluate(() => localStorage.removeItem("bw:coachmark:messages:v1"));
    await page.goto("/faq");
    await floating(page).waitFor(T);
    await page.getByText("Your BudgetWise messages will appear here.").waitFor(T);
    const box = await floating(page).boundingBox();
    assert.ok(box.x + box.width > PHONE.width - 40 && box.y + box.height > PHONE.height - 120, "bottom-right, in thumb reach");
    assert.ok(box.width >= 48 && box.height >= 48, "large tap target");
    await page.getByRole("button", { name: "Dismiss tip" }).click();
    await page.reload();
    await floating(page).waitFor(T);
    await page.waitForTimeout(800);
    assert.equal(await page.getByText("Your BudgetWise messages will appear here.").count(), 0, "not repeated");
  });

  test("the button opens the unread conversation first, full screen; Back returns to the same place", async () => {
    const { page } = people.custc;
    await page.goto("/faq");
    await floating(page).getByTestId("messages-badge").waitFor(T);
    await floating(page).click();
    // A real page, not a sheet over the storefront.
    await page.waitForURL(/\/orders\/BW-LT024$/, T);
    const screen = page.locator("[data-messenger-screen]");
    await screen.getByText(/Order BW-LT024/).waitFor(T);
    await screen.getByText("Hi po! We reviewed your order.").waitFor(T);
    assert.equal(await page.getByRole("dialog").count(), 0, "no dialog/sheet");
    const layout = await page.evaluate(() => {
      const rect = document.querySelector("[data-messenger-screen]").getBoundingClientRect();
      const before = window.scrollY;
      window.scrollTo(0, 5000);
      const scrolled = window.scrollY !== before;
      return { top: rect.top, height: rect.height, width: rect.width, scrolled, vh: window.innerHeight, vw: window.innerWidth };
    });
    assert.equal(layout.top, 0, "covers from the top");
    assert.equal(Math.round(layout.height), layout.vh, "covers the whole height");
    assert.equal(Math.round(layout.width), layout.vw, "covers the whole width");
    assert.equal(layout.scrolled, false, "the page underneath cannot scroll");
    await noHorizontalOverflow(page, "messenger screen 390");
    await page.goBack();
    await page.waitForURL(/\/faq$/, T);
  });

  test("reading clears the badge everywhere; a new reply brings it back instantly (no refresh)", async () => {
    const { page } = people.custc;
    // Reading LT024 just now cleared it on the server.
    await page.waitForFunction(() => !document.querySelector('[data-testid="messages-badge"]'), null, T);
    assert.equal(await page.getByRole("link", { name: /^My Orders \(/ }).count(), 0, "header badge cleared too");
    await adminSays("BW-LT023", "Good news po, your order is being processed.");
    await floating(page).getByTestId("messages-badge").filter({ hasText: "1" }).waitFor(T);
    await page.getByRole("link", { name: /^My Orders \(1 unread/ }).waitFor(T);
    // ...and opening goes straight to that conversation.
    await floating(page).click();
    await page.waitForURL(/\/orders\/BW-LT023$/, T);
    await page.locator("[data-messenger-screen]").getByText("Good news po, your order is being processed.").waitFor(T);
  });

  test("the full-screen chat is realtime, and Back returns to My Orders without a reload", async () => {
    const { page } = people.custc;
    await adminSays("BW-LT023", "Please accept our friend request po.");
    await page.locator("[data-messenger-screen]").getByText("Please accept our friend request po.").waitFor(T);
    assert.equal(await page.locator('[data-connection="reconnecting"]').count(), 0, "no reconnect warning in normal use");
    await page.goto("/account/orders");
    await page.locator('[data-order-card="BW-LT023"]').click();
    await page.locator("[data-messenger-screen]").getByText("Please accept our friend request po.").waitFor(T);
    const marker = await page.evaluate(() => (window.__noReload = Math.random()));
    await page.getByTestId("chat-back").click();
    await page.waitForURL(/\/account\/orders$/, T);
    await page.locator('[data-order-card="BW-LT023"]').waitFor(T);
    assert.equal(await page.evaluate(() => window.__noReload), marker, "client navigation, no document reload");
  });

  test("full-screen order chat: composer stays reachable with the keyboard open", async () => {
    const { page } = people.custa;
    await page.goto("/orders/BW-X20");
    const box = page.getByLabel("Message", { exact: true });
    await box.waitFor(T);
    assert.equal(await page.locator("footer").filter({ hasText: /Terms|Refund/ }).count(), 0, "no site footer under the messenger");
    await page.setViewportSize({ width: 390, height: 470 }); // on-screen keyboard
    await page.waitForTimeout(400);
    const rect = await box.boundingBox();
    assert.ok(rect && rect.y + rect.height <= 470 && rect.y > 0, `composer visible above the keyboard (${JSON.stringify(rect)})`);
    for (const name of ["Send message", /^Attach images/]) {
      const target = await page.getByRole("button", { name }).boundingBox();
      assert.ok(target && target.y + target.height <= 470 && target.width >= 40, `${name} reachable`);
    }
    await box.fill("Typed with the keyboard open");
    // Phone keyboards: Enter adds a line; the Send button sends.
    await page.getByRole("button", { name: "Send message" }).click();
    await chatLog(page).getByText("Typed with the keyboard open").waitFor(T);
    await page.setViewportSize(PHONE);
  });
});

describe("Part 2 — Done / Completed workflow", { concurrency: false }, () => {
  test("Mark Done: leaves Active for every admin at once; customer sees Completed live", async () => {
    const xobBefore = await sql("select id, status from orders order by id");
    for (const key of ["robert", "andre", "kenneth"]) {
      await people[key].page.goto("/admin/orders");
      await people[key].page.locator('a[href="/admin/orders/BW-X01"]').waitFor(T);
    }
    const customer = people.custa.page;
    await customer.goto("/orders/BW-X01");
    await customer.getByText(/Order BW-X01/).waitFor(T);

    const robert = people.robert.page;
    await robert.locator('a[href="/admin/orders/BW-X01"]').click();
    await robert.getByRole("button", { name: "Mark Done" }).click();
    await robert.getByText(/It moves back to Active if the customer sends a message/).waitFor(T);
    for (const key of ["robert", "andre", "kenneth"]) {
      await people[key].page.locator('a[href="/admin/orders/BW-X01"]').waitFor({ state: "detached", timeout: 30_000 });
    }
    await people.andre.page.getByRole("tab", { name: "Done" }).click();
    await people.andre.page.locator('a[href="/admin/orders/BW-X01"]').getByText("Done").waitFor(T);
    await customer.getByText("Completed ✓ — this order is finished.").waitFor(T);
    const xobAfter = await sql("select id, status from orders order by id");
    assert.deepEqual(xobAfter, xobBefore, "XOB orders.status untouched");
  });

  test("customer writes again: it reopens by itself for all admins with unread; Completed disappears", async () => {
    const customer = people.custa.page;
    await customer.getByLabel("Message", { exact: true }).fill("Hello po?");
    await customer.getByRole("button", { name: "Send message" }).click();
    await customer.getByText("Completed ✓ — this order is finished.").waitFor({ state: "detached", timeout: 30_000 });
    await people.andre.page.getByRole("tab", { name: "Active" }).click();
    // (The row's preview line may show "Robert is viewing" — presence wins.)
    await people.andre.page.locator('a[href="/admin/orders/BW-X01"]').waitFor(T);
    assert.equal(await people.andre.page.locator('a[href^="/admin/orders/BW-"]').first().getAttribute("href"), "/admin/orders/BW-X01", "back at the top");
    // Kenneth never touched his list: it came back by itself (realtime).
    await people.kenneth.page.locator('a[href="/admin/orders/BW-X01"]').waitFor(T);
    for (const key of ["andre", "kenneth"]) {
      const { row } = JSON.parse((await api(people[key].page, "/api/admin/inbox/BW-X01", {})).text);
      assert.equal(row.state, "active", `${key}: Active again`);
      assert.ok(row.unreadCount > 0, `${key}: unread`);
      assert.equal(row.lastMessagePreview, "Hello po?");
    }
    const audit = await sql("select actor_user_id, details from store_chat_audit_log where order_number = 'BW-X01' and action = 'conversation.reopened' order by id desc limit 1");
    assert.equal(audit[0].actor_user_id, ids.custa);
    assert.equal(audit[0].details.cause, "customer_message");
  });

  test("manual Reopen from the Done view is audited with the right admin", async () => {
    const robert = people.robert.page;
    await robert.getByRole("button", { name: "Mark Done" }).click();
    await robert.getByText(/It moves back to Active/).waitFor(T);
    const andre = people.andre.page;
    await andre.getByRole("tab", { name: "Done" }).click();
    await andre.locator('a[href="/admin/orders/BW-X01"]').click();
    await andre.getByRole("button", { name: "Reopen" }).click();
    await andre.getByRole("button", { name: "Mark Done" }).waitFor(T);
    const rows = await sql("select action, actor_user_id, details from store_chat_audit_log where order_number = 'BW-X01' order by id");
    const done = rows.filter((row) => row.action === "conversation.done");
    const reopened = rows.filter((row) => row.action === "conversation.reopened");
    assert.equal(done.at(-1).actor_user_id, ids.robert);
    assert.equal(reopened.at(-1).actor_user_id, ids.andre);
    assert.equal(reopened.at(-1).details.cause, "admin");
  });

  test("customers cannot set or fake the workflow state", async () => {
    const customer = people.custa.page;
    for (const state of ["done", "active"]) {
      const result = await api(customer, "/api/admin/orders/BW-X01/state", postJson({ state, lastSeenMessageId: crypto.randomUUID() }));
      assert.equal(result.status, 403, `customer ${state}`);
    }
    const other = await api(people.custb.page, "/api/admin/orders/BW-X01/state", postJson({ state: "done", lastSeenMessageId: crypto.randomUUID() }));
    assert.equal(other.status, 403);
    const foreign = await api(people.custb.page, "/api/account/orders?section=completed", {});
    assert.equal(JSON.parse(foreign.text).rows.some((row) => row.orderNumber.startsWith("BW-LT") || row.orderNumber.startsWith("BW-X")), false, "B never sees A's or C's orders");
  });
});

describe("Part 3 — order summaries and images", { concurrency: false }, () => {
  const itemCount = (n) => Array.from({ length: n }, (_, i) => 1 + (i % 3 === 0 ? 2 : 0)).reduce((a, b) => a + b, 0);

  test("order summaries for 1, 3, 10 and 20 products stay compact (Qty, not duplicate cards)", async () => {
    const { page } = people.custa;
    for (const n of [1, 3, 10, 20]) {
      await page.goto(`/orders/BW-X${String(n).padStart(2, "0")}`);
      const strip = page.getByRole("region", { name: "Your order" });
      await strip.getByText(`${itemCount(n)} item${itemCount(n) === 1 ? "" : "s"}`).waitFor(T);
      const collapsed = await strip.boundingBox();
      assert.ok(collapsed.height < 80, `collapsed summary is compact (${collapsed.height}px)`);
      if (n > 2) await strip.getByText(`+${n - 2}`).waitFor(T);
      await strip.getByRole("button", { name: /View items/ }).click();
      const list = strip.getByRole("list", { name: "Order items" });
      assert.equal(await list.getByRole("listitem").count(), n, "one row per product line");
      await list.getByText("Qty 3").first().waitFor(T);
      const expanded = await strip.boundingBox();
      assert.ok(expanded.height <= PHONE.height * 0.6, "expanded list is bounded, chat stays reachable");
      await noHorizontalOverflow(page, `order with ${n} products`);
      await strip.getByRole("button", { name: /Collapse/ }).click();
    }
    const admin = people.robert.page;
    await admin.goto("/admin/orders/BW-X20");
    const panel = admin.getByRole("complementary", { name: "Order details" });
    await panel.getByText("Money 1").waitFor(T);
    assert.ok((await panel.locator("img").count()) >= 20, "admin panel shows the product images");
  });

  test("BudgetWise sends galleries of 1, 2, 4, 8 (proof of delivery) and 10 images", async () => {
    const admin = people.robert.page;
    await admin.goto("/admin/orders/BW-X10");
    const chat = admin.locator('section[aria-label^="Chat with"]');
    for (const n of [1, 2, 4, 8, 10]) {
      await chat.locator('input[type="file"]').setInputFiles(images(n, `album${n}`));
      await chat.getByText(`${n} image${n === 1 ? "" : "s"} selected`).waitFor(T);
      if (n === 8) await chat.getByRole("button", { name: "Proof of delivery" }).click();
      await chat.getByRole("button", { name: "Send message" }).click();
      await admin.locator(`[data-album-count="${n}"]`).last().waitFor({ timeout: 60_000 });
    }
    const customer = people.custa.page;
    const requests = [];
    customer.on("request", (request) => request.url().includes("/api/order-chat/media/") && requests.push(request.url()));
    await customer.goto("/orders/BW-X10");
    const log = chatLog(customer);
    for (const n of [1, 2, 4, 8, 10]) await log.locator(`[data-album-count="${n}"]`).waitFor(T);
    const proof = log.locator('[data-album-count="8"]');
    await proof.getByText("Proof of delivery").waitFor(T);
    await proof.getByText("8 screenshots").waitFor(T);
    await proof.getByText("+5").waitFor(T);
    await log.locator('[data-album-count="10"]').getByText("+7").waitFor(T);
    assert.equal(await log.locator('[data-album-count="4"] img').count(), 4, "2x2");
    assert.equal(await log.locator('[data-album-count="10"] img').count(), 4, "never 10 images dumped in the chat");
    await customer.waitForTimeout(1500);
    assert.equal(requests.some((url) => url.includes("size=full")), false, "only thumbnails load in the chat");
    await noHorizontalOverflow(customer, "galleries 390");
  });

  test("viewer: counter, next/previous, swipe, close returns to the same chat position", async () => {
    const customer = people.custa.page;
    const log = chatLog(customer);
    const proof = log.locator('[data-album-count="8"]');
    await proof.scrollIntoViewIfNeeded();
    const scrollBefore = await log.evaluate((node) => node.scrollTop);
    await proof.getByRole("button", { name: "View photo 2" }).click();
    const viewer = customer.getByRole("dialog");
    await viewer.getByText("2 / 8").waitFor(T);
    await viewer.getByRole("button", { name: "Next image" }).click();
    await viewer.getByText("3 / 8").waitFor(T);
    await viewer.getByRole("button", { name: "Previous image" }).click();
    await viewer.getByText("2 / 8").waitFor(T);
    await customer.keyboard.press("ArrowRight");
    await viewer.getByText("3 / 8").waitFor(T);
    assert.match(await viewer.locator("img").first().getAttribute("src"), /size=full/, "full image only in the viewer");
    await customer.keyboard.press("Escape");
    await viewer.waitFor({ state: "detached", timeout: 10_000 });
    assert.ok(Math.abs((await log.evaluate((node) => node.scrollTop)) - scrollBefore) < 4, "same scroll position");
  });

  test("customers can send several images at once; a broken file is named and the rest still upload", async () => {
    const customer = people.custa.page;
    await customer.goto("/orders/BW-X03");
    const input = customer.locator('input[type="file"]');
    await input.setInputFiles([...images(1, "receipt"), ...images(1, "screenshot")]);
    await customer.getByText("2 images selected").waitFor(T);
    await customer.getByLabel("Message", { exact: true }).fill("Receipt po");
    await customer.getByRole("button", { name: "Send message" }).click();
    await chatLog(customer).locator('[data-album-count="2"]').waitFor({ timeout: 60_000 });
    await people.robert.page.goto("/admin/orders/BW-X03");
    await people.robert.page.locator('[data-album-count="2"]').waitFor(T);

    await input.setInputFiles([
      ...images(1, "good"),
      { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("this is not really a png file") },
    ]);
    await customer.getByRole("button", { name: "Send message" }).click();
    await customer.getByText(/Image 2 \(broken\.png\)/).waitFor({ timeout: 60_000 });
    await customer.getByText("1 image did not upload.").waitFor(T);
    await customer.getByRole("button", { name: "Remove unsent message" }).click();

    const big = makePng(1200, 1200, [1, 2, 3]);
    const form = Buffer.concat([big, Buffer.alloc(4.3 * 1024 * 1024)]);
    const result = await customer.evaluate(async (bytes) => {
      const data = new FormData();
      data.set("clientMessageId", crypto.randomUUID());
      data.set("position", "0");
      data.set("file", new File([new Uint8Array(bytes)], "huge.png", { type: "image/png" }));
      data.set("thumb", new File([new Uint8Array(bytes.slice(0, 100))], "t.png", { type: "image/png" }));
      return (await fetch("/api/order-chat/BW-X03/uploads?as=customer", { method: "POST", body: data })).status;
    }, [...form]);
    assert.ok(result === 413 || result === 400, `over 4 MB refused (${result})`);
  });

  test("extreme conversation on both phone sizes: long history, 20 products, galleries, payment card, receipt", async () => {
    const admin = people.robert.page;
    await admin.goto("/admin/orders/BW-X20");
    await admin.getByRole("button", { name: "Send payment details" }).click();
    await admin.getByRole("button", { name: "Send to customer" }).click();
    const chat = admin.locator('section[aria-label^="Chat with"]');
    await chat.locator('input[type="file"]').setInputFiles(images(8, "x20-proof"));
    await chat.getByRole("button", { name: "Proof of delivery" }).click();
    await chat.getByRole("button", { name: "Send message" }).click();
    await admin.locator('[data-album-count="8"]').last().waitFor({ timeout: 60_000 });
    await adminSays("BW-X20", "Completed na po. Thank you! 💜");

    for (const viewport of [PHONE, PHONE_LARGE]) {
      const { page, context, errors } = await signIn("custa", viewport);
      await page.goto("/orders/BW-X20");
      const log = chatLog(page);
      await log.getByText("Completed na po. Thank you!").waitFor(T);
      await log.getByText("GCash Payment").waitFor(T);
      await log.locator('[data-album-count="8"]').waitFor(T);
      await noHorizontalOverflow(page, `extreme ${viewport.width}`);
      const composer = await page.getByLabel("Message", { exact: true }).boundingBox();
      assert.ok(composer.y + composer.height <= viewport.height, "composer on screen");
      await log.evaluate((node) => node.scrollTo({ top: 0 }));
      await page.getByRole("button", { name: "Jump to latest message" }).click();
      await page.waitForFunction(
        (height) => {
          const node = [...document.querySelectorAll('[role="log"] p')].find((p) => p.textContent?.includes("Completed na po. Thank you!"));
          const box = node?.getBoundingClientRect();
          return Boolean(box && box.top > 0 && box.bottom < height);
        },
        viewport.height,
        { timeout: 10_000 },
      );
      assert.deepEqual(errors, [], "no console errors");
      await context.close();
    }
  });
});
