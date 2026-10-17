// Conversation switching behaviour in a real browser against a LOCAL stack:
// client-side switching, cache, prefetch, race safety, non-blocking
// mark-read, realtime merge, keyboard and history navigation.
//
//   E2E_BASE_URL=http://127.0.0.1:3100 E2E_SUPABASE_SERVICE_ROLE_KEY=... \
//   node --test scripts/e2e/inbox-switching.e2e.mjs
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright-core";
import { seed, seedPeak } from "./seed-local.mjs";
import { instrument, openAdmin } from "./inbox-switch-profile.mjs";

const T = { timeout: 30_000 };
let browser;
let admin;
let customer;
let log;
let peak;

const row = (page, order) => page.locator(`a[href="/admin/orders/${order}"]`);
const header = (page) => page.locator('section[aria-label^="Chat with"]');
const thread = (page) => page.locator('[role="log"]');
const panel = (page) => page.locator('aside[aria-label="Order details"]');

async function shows(page, target, { details = true } = {}) {
  await header(page).and(page.locator(`[aria-label="Chat with ${target.name}"]`)).waitFor(T);
  await thread(page).getByText(`LAST-${target.orderNumber}`).waitFor(T);
  if (details) await panel(page).getByText(target.roblox).first().waitFor(T);
}

function requestsSince(index) {
  return log.requests.slice(index);
}

before(async () => {
  const ids = await seed();
  peak = await seedPeak(ids, { count: 14, longEvery: 4, longLength: 120 });
  browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  admin = await openAdmin(browser, "robert", { latency: 0 });
  log = instrument(admin.page);
  customer = await openAdmin(browser, "custa", { latency: 0 }); // customers bounce off /admin with a session
  await admin.page.goto("/admin/orders");
  await row(admin.page, peak.at(-1).orderNumber).waitFor(T);
  await admin.page.getByRole("status").filter({ hasText: "Live" }).first().waitFor(T);
});

after(async () => {
  await browser?.close();
});

describe("conversation switching", { concurrency: false }, () => {
  test("switching is client-side: URL changes, no server render, list and realtime stay mounted", async () => {
    const { page } = admin;
    await page.evaluate(() => {
      document.querySelector('[role="tablist"][aria-label="Filter chats"]').__kept = true;
    });
    const joins = log.joins;
    const start = log.requests.length;
    for (const target of peak.slice(-4)) {
      await row(page, target.orderNumber).click();
      await shows(page, target);
      assert.equal(new URL(page.url()).pathname, `/admin/orders/${target.orderNumber}`);
    }
    assert.equal(requestsSince(start).filter((r) => r.rsc).length, 0, "no route/server-component requests");
    assert.equal(await page.evaluate(() => document.querySelector('[role="tablist"][aria-label="Filter chats"]').__kept), true, "inbox list never remounted");
    assert.equal(log.joins, joins, "realtime channel not re-joined while switching");
    assert.equal(log.leaves, 0, "realtime channel never left while switching");
  });

  test("revisiting a cached conversation renders it without fetching the first page again", async () => {
    const { page } = admin;
    const [x, y] = [peak.at(-1), peak.at(-2)];
    await row(page, x.orderNumber).click();
    await shows(page, x);
    await row(page, y.orderNumber).click();
    await shows(page, y);
    const start = log.requests.length;
    const t0 = Date.now();
    await row(page, x.orderNumber).click();
    await shows(page, x);
    const elapsed = Date.now() - t0;
    const firstPage = requestsSince(start).filter((r) => r.path === `/api/order-chat/${x.orderNumber}/messages?as=admin`);
    assert.equal(firstPage.length, 0, "no first-page refetch for a cached thread");
    assert.ok(elapsed < 1000, `cached revisit took ${elapsed}ms`);
  });

  test("hover prefetch: a hovered conversation opens with nothing left to load", async () => {
    const { page } = admin;
    const target = peak[1];
    await row(page, target.orderNumber).scrollIntoViewIfNeeded();
    await row(page, target.orderNumber).hover();
    await page.waitForResponse((r) => r.url().includes(`/api/admin/orders/${target.orderNumber}/details`), T);
    await page.waitForTimeout(400);
    const start = log.requests.length;
    await row(page, target.orderNumber).click();
    await shows(page, target);
    const blocking = requestsSince(start).filter(
      (r) => r.method === "GET" && (r.path.startsWith(`/api/order-chat/${target.orderNumber}/messages?as=admin`) && !r.path.includes("after=") || r.path === `/api/admin/orders/${target.orderNumber}/details`),
    );
    assert.equal(blocking.length, 0, "prefetched chat needed no first-page or details request");
  });

  test("rapid A -> B -> C with slow A/B responses: only C ever shows, late data never overwrites it", async () => {
    const { page } = admin;
    const [a, b, c] = [peak[4], peak[5], peak[6]]; // never opened
    const slow = new Set([a.orderNumber, b.orderNumber]);
    await page.route(/\/api\/(order-chat|admin\/orders)\/BW-PK\d+\/(messages|details)/, async (route) => {
      const hit = [...slow].find((order) => route.request().url().includes(order));
      if (hit) await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await row(page, a.orderNumber).click();
    await row(page, b.orderNumber).click();
    await row(page, c.orderNumber).click();
    const stale = await page.evaluate(async ({ a, b, c }) => {
      const seen = [];
      const end = performance.now() + 3500;
      while (performance.now() < end) {
        const chat = document.querySelector('section[aria-label^="Chat with"]')?.getAttribute("aria-label");
        const log = document.querySelector('[role="log"]')?.innerText ?? "";
        const details = document.querySelector('aside[aria-label="Order details"]')?.innerText ?? "";
        if (chat !== `Chat with ${c.name}`) seen.push(`header:${chat}`);
        for (const other of [a, b]) {
          if (log.includes(`LAST-${other.orderNumber}`)) seen.push(`thread:${other.orderNumber}`);
          if (details.includes(other.roblox)) seen.push(`details:${other.orderNumber}`);
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      return seen;
    }, { a, b, c });
    await page.unroute(/\/api\/(order-chat|admin\/orders)\/BW-PK\d+\/(messages|details)/);
    assert.deepEqual(stale, [], "no frame showed A or B after C was selected");
    await shows(page, c);
    assert.equal(new URL(page.url()).pathname, `/admin/orders/${c.orderNumber}`);
  });

  test("mark-read never blocks: the thread renders while the read request is still pending", async () => {
    const { page } = admin;
    const target = peak[7];
    let readSeen = false;
    await page.route(`**/api/order-chat/${target.orderNumber}/read**`, async (route) => {
      readSeen = true;
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    const t0 = Date.now();
    await row(page, target.orderNumber).click();
    await shows(page, target);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 3000, `thread rendered in ${elapsed}ms despite a 4s read request`);
    await page.waitForTimeout(300);
    assert.equal(readSeen, true, "read position is still reported");
    // Optimistic: my unread badge for it is already gone.
    assert.equal(await row(page, target.orderNumber).locator("span.bg-primary.text-primary-foreground").count(), 0);
    await page.unroute(`**/api/order-chat/${target.orderNumber}/read**`);
  });

  test("a new customer message for a cached, not-open conversation is merged into its cache", async () => {
    const { page } = admin;
    const [p, q] = [peak[8], peak[9]];
    await row(page, p.orderNumber).click();
    await shows(page, p);
    await row(page, q.orderNumber).click();
    await shows(page, q);
    const text = `realtime-merge-${Date.now()}`;
    const sent = await customer.page.evaluate(async ({ order, text }) => {
      const response = await fetch(`/api/order-chat/${order}/messages?as=customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, clientMessageId: crypto.randomUUID() }),
      });
      return response.status;
    }, { order: p.orderNumber, text });
    assert.equal(sent, 201);
    // The inbox preview updates, and the cached thread pulls the message in
    // the background (delta) before P is opened again.
    await row(page, p.orderNumber).getByText(text).waitFor(T);
    await page.waitForResponse((r) => r.url().includes(`/api/order-chat/${p.orderNumber}/messages?as=admin&after=`), T).catch(() => null);
    const start = log.requests.length;
    await row(page, p.orderNumber).click();
    await thread(page).getByText(text).waitFor({ timeout: 2000 });
    assert.equal(
      requestsSince(start).filter((r) => r.path === `/api/order-chat/${p.orderNumber}/messages?as=admin`).length,
      0,
      "no full reload of P",
    );
    assert.equal(await thread(page).getByText(text).count(), 1, "exactly once");
  });

  test("back/forward follow the conversation history; reload opens the linked conversation", async () => {
    const { page } = admin;
    const [p, q] = [peak[8], peak[9]];
    await row(page, q.orderNumber).click();
    await shows(page, q);
    await row(page, p.orderNumber).click();
    await shows(page, p);
    await page.goBack();
    await shows(page, q);
    await page.goForward();
    await shows(page, p);
    await page.reload();
    await shows(page, p);
    await page.getByRole("status").filter({ hasText: "Live" }).first().waitFor(T);
  });

  test("keyboard: arrows move through the list, Enter opens, the composer gets focus", async () => {
    const { page } = admin;
    const list = page.getByRole("list", { name: "Conversations" });
    const links = list.locator("a[data-order-number]");
    await links.first().focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-order-number"));
    assert.equal(focused, await links.nth(2).getAttribute("data-order-number"));
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/admin/orders/${focused}`);
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Message", null, T);
    await page.keyboard.press("ArrowUp"); // inside the composer: does not switch chats
    assert.equal(new URL(page.url()).pathname, `/admin/orders/${focused}`);
  });

  test("ten switches through cached and never-opened chats: right content every time, no duplicates", async () => {
    const { page } = admin;
    const targets = [...peak.slice(0, 5), ...peak.slice(8, 13)];
    const joins = log.joins;
    for (const target of targets) {
      await row(page, target.orderNumber).click();
      await shows(page, target);
      assert.equal(await thread(page).getByText(`LAST-${target.orderNumber}`).count(), 1);
    }
    assert.equal(log.joins, joins, "no realtime re-joins across ten switches");
  });

  test("admin on a phone: list -> chat -> Back keeps the list state; reopening is instant", async () => {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
    await context.addCookies(await admin.context.cookies());
    const page = await context.newPage();
    await page.goto("/admin/orders");
    const search = page.getByPlaceholder("Name, order number, Roblox username");
    await search.fill("Peak Customer");
    const target = peak[10];
    await row(page, target.orderNumber).click();
    await shows(page, target, { details: false }); // details sit behind a button on phones
    assert.equal(await search.isVisible(), false, "list hidden while a chat is open on a phone");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      "no horizontal overflow",
    );
    await page.getByRole("button", { name: "Back to all chats" }).click();
    await search.waitFor(T);
    assert.equal(new URL(page.url()).pathname, "/admin/orders");
    assert.equal(await search.inputValue(), "Peak Customer", "search kept");
    const t0 = Date.now();
    await row(page, target.orderNumber).click();
    await shows(page, target, { details: false });
    assert.ok(Date.now() - t0 < 1000, "cached reopen");
    await context.close();
  });
});
