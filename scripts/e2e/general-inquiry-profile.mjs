// "Message Us Now" end to end in a real browser, on phone viewports, with
// the customer APIs and realtime socket mocked (no database; 800 ms per API
// call by default, like production today). Three customers:
//   A. signed out            -> Google sign-in, coming back to /messages
//   B. signed in, no orders  -> straight into their General Inquiry
//   C. signed in with orders -> My Orders with the General Inquiry pinned
// Measures from the tap (in the page) and checks Back, layout and requests.
//
//   E2E_BASE_URL=http://127.0.0.1:3100 node scripts/e2e/general-inquiry-profile.mjs [--api=800]
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const API_MS = Number(arg("api", "800"));
const SHOTS = arg("shots", null);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const KEY = "GI-ABCDEF12";
const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function inquirySummary(conversationId) {
  return {
    summary: {
      kind: "inquiry", orderNumber: KEY, conversationId, totalAmount: 0, createdAt: iso(60), buyerName: "Juan",
      robloxUsername: "", status: "", state: "active", paymentSent: false, itemCount: 0, summary: "General Inquiry", lines: [],
    },
    adminRead: { at: null, messageId: null },
    ownRead: { at: null, messageId: null },
    slots: [],
    assistant: conversationId ? { name: "Twicks", assigned: true } : null,
  };
}

async function openCustomer(browser, { signedIn, orders, inquiryExists }) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  if (signedIn) await context.addCookies([{ name: "sb-e2e-auth-token", value: "1", url: BASE }]);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const log = { requests: [], errors: [], posted: [] };
  page.on("pageerror", (error) => log.errors.push(error.message));
  const json = (route, body, status = 200) =>
    sleep(API_MS).then(() => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => undefined));
  const sent = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    log.requests.push(`${request.method()} ${url.pathname}`);
    if (!signedIn) return json(route, { error: "Please sign in first." }, 401);
    if (url.pathname === "/api/account/conversations") {
      const conversations = [];
      if (orders) conversations.push({ conversationId: "conv-o1", orderNumber: "BW-E2E001", state: "active", unreadCount: 0, lastMessageAt: iso(30), lastMessagePreview: "Thanks", lastSenderRole: "admin" });
      if (inquiryExists) conversations.push({ conversationId: "conv-gi", orderNumber: KEY, state: "active", unreadCount: 1, lastMessageAt: iso(5), lastMessagePreview: "Yes po, we have that!", lastSenderRole: "admin" });
      return json(route, { userId: "e2e-user", email: "juan@example.com", conversations });
    }
    if (url.pathname === "/api/account/orders") {
      const rows = orders && url.searchParams.get("section") !== "completed"
        ? [{ orderNumber: "BW-E2E001", totalAmount: 250, createdAt: iso(600), robloxUsername: "p", status: "pending", state: "active", doneAt: null, unreadCount: 0, lastMessageAt: iso(30), lastMessagePreview: "Thanks", lastSenderRole: "admin", paymentSent: false, summary: "1 item · Blox Fruits", thumbnails: [] }]
        : [];
      return json(route, { rows, nextCursor: null });
    }
    if (url.pathname === "/api/account/inquiry" && request.method() === "POST") return json(route, { key: KEY });
    if (url.pathname === `/api/order-chat/${KEY}/summary`) return json(route, inquirySummary(inquiryExists || sent.length ? "conv-gi" : null));
    if (url.pathname === `/api/order-chat/${KEY}/messages`) {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        const message = { id: `m-${sent.length + 1}`, orderNumber: KEY, senderRole: "customer", kind: "text", body: body.body, hasAttachment: false, createdAt: new Date().toISOString(), clientMessageId: body.clientMessageId, payment: null, album: null };
        sent.push(message);
        log.posted.push(body.body);
        return json(route, { message }, 201);
      }
      const history = inquiryExists
        ? [{ id: "gi-1", orderNumber: KEY, senderRole: "customer", kind: "text", body: "Do you sell Robux?", hasAttachment: false, createdAt: iso(10), clientMessageId: null, payment: null, album: null },
           { id: "gi-2", orderNumber: KEY, senderRole: "admin", senderName: "Twicks", kind: "text", body: "Yes po, we have that!", hasAttachment: false, createdAt: iso(5), clientMessageId: null, payment: null, album: null }]
        : [];
      return json(route, url.searchParams.has("after") ? { messages: [] } : { messages: [...history, ...sent], hasOlder: false });
    }
    if (url.pathname.endsWith("/read")) return json(route, { cursor: {} });
    return route.fulfill({ status: 404, body: "{}" });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((raw) => {
      let frame;
      try { frame = JSON.parse(String(raw)); } catch { return; }
      const [joinRef, ref, topic, event] = Array.isArray(frame) ? frame : [];
      if (event === "phx_join" || event === "phx_leave" || event === "heartbeat") {
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
      }
    });
  });
  return { context, page, log };
}

/** Taps the button; reports when each condition first holds, from the tap. */
async function tapAndMeasure(page, selector, marks) {
  await page.evaluate((marks) => {
    window.__marks = null;
    window.__arm = () => {
      const t0 = performance.now();
      const found = {};
      const check = () => {
        for (const [name, code] of Object.entries(marks)) {
          if (!(name in found) && new Function(`return (${code})`)()) found[name] = Math.round(performance.now() - t0);
        }
        if (Object.keys(found).length === Object.keys(marks).length || performance.now() - t0 > 15000) window.__marks = found;
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    };
  }, marks);
  const target = page.locator(selector).first();
  await target.waitFor({ state: "visible" });
  await target.evaluate((element) => element.addEventListener("pointerdown", () => window.__arm(), { once: true }));
  await target.tap();
  await page.waitForFunction(() => window.__marks, null, { timeout: 20_000 });
  return page.evaluate(() => window.__marks);
}

const SHELL = `document.querySelector("[data-messenger-screen]")`;
const results = {};
const browser = await chromium.launch({ executablePath: CHROME });
try {
  // ---- A: signed out
  {
    const { context, page, log } = await openCustomer(browser, { signedIn: false });
    await page.goto("/games");
    await sleep(800);
    const button = await page.locator('[data-testid="message-us-now"]').count();
    const label = await page.locator('[data-testid="message-us-now"]').first().innerText();
    const marks = await tapAndMeasure(page, '[data-testid="message-us-now"]', { login: `location.pathname === "/login"` });
    results.signedOut = { buttonCount: button, label, next: new URL(page.url()).searchParams.get("next"), ...marks, apiCalls: log.requests.length, errors: log.errors };
    await context.close();
  }

  // ---- B: signed in, never ordered
  {
    const { context, page, log } = await openCustomer(browser, { signedIn: true, orders: false, inquiryExists: false });
    await page.goto("/games");
    await page.waitForFunction(() => document.querySelector('[data-testid="message-us-now"]'));
    await sleep(API_MS + 600); // the account check has answered
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/message-us-now-games.png` });
    const marks = await tapAndMeasure(page, '[data-testid="message-us-now"]', {
      shell: SHELL,
      chat: `location.pathname === "/orders/${KEY}" && document.querySelector('[data-testid="chat-subject"]')?.textContent === "General Inquiry"`,
      composer: `location.pathname === "/orders/${KEY}" && document.querySelector("[data-messenger-screen] textarea")`,
    });
    await page.waitForSelector('[data-testid="inquiry-empty"]');
    const view = await page.evaluate(() => ({
      header: document.querySelector('[data-testid="chat-assistant"]')?.textContent,
      subject: document.querySelector('[data-testid="chat-subject"]')?.textContent,
      paymentNotice: /payment/i.test(document.querySelector("[data-messenger-screen]")?.innerText ?? ""),
      orderStrip: /YOUR ORDER/i.test(document.querySelector("[data-messenger-screen]")?.innerText ?? ""),
      covers: (() => { const r = document.querySelector("[data-messenger-screen]").getBoundingClientRect(); return r.top === 0 && Math.round(r.height) === innerHeight && Math.round(r.width) === innerWidth; })(),
      buttonOnChat: document.querySelectorAll('[data-testid="message-us-now"]').length,
    }));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/inquiry-empty.png` });
    await page.locator("[data-messenger-screen] textarea").fill("Hi! Do you sell Robux for Blox Fruits?");
    await page.getByRole("button", { name: "Send message" }).tap();
    await page.waitForFunction(() => /Do you sell Robux for Blox Fruits/.test(document.querySelector("[data-messenger-screen]").innerText));
    const back = await tapAndMeasure(page, '[data-testid="chat-back"]', { home: `location.pathname === "/games"` });
    const history = await page.evaluate(() => history.length);
    results.noOrders = { ...marks, view, sent: log.posted, backToWhereTapped: back, historyLength: history,
      inquiryPosts: log.requests.filter((r) => r === "POST /api/account/inquiry").length, errors: log.errors };
    // Second tap: the key is known now, no POST, no /messages hop.
    const again = await tapAndMeasure(page, '[data-testid="message-us-now"]', { chat: `location.pathname === "/orders/${KEY}"` });
    results.noOrders.secondOpen = { ...again, inquiryPostsTotal: log.requests.filter((r) => r === "POST /api/account/inquiry").length };
    await context.close();
  }

  // ---- C: signed in with orders and an inquiry with a reply
  {
    const { context, page, log } = await openCustomer(browser, { signedIn: true, orders: true, inquiryExists: true });
    await page.goto("/games");
    await sleep(API_MS + 600);
    const marks = await tapAndMeasure(page, '[data-testid="message-us-now"]', {
      chat: `location.pathname === "/orders/${KEY}"`,
    });
    // An unread reply opens that chat directly; Back, then the list.
    await page.locator('[data-testid="chat-back"]').tap();
    await page.waitForURL(/\/games$/);
    // No unread left after reading: Message Us Now -> My Orders with the inquiry pinned.
    await sleep(300);
    await page.goto("/account/orders");
    await page.waitForSelector('[data-testid="inquiry-card"]');
    await page.waitForSelector("[data-order-card]");
    await sleep(1500); // a person reads the list (the chat page is prefetched meanwhile)
    const order = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="inquiry-card"], [data-order-card]')];
      return cards.map((c) => c.getAttribute("data-testid") ?? c.getAttribute("data-order-card"));
    });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/my-orders-inquiry.png` });
    const card = await tapAndMeasure(page, '[data-testid="inquiry-card"]', { chat: `location.pathname === "/orders/${KEY}" && ${SHELL}` });
    await page.waitForSelector("[data-messenger-screen] [data-sender-label]");
    const labels = await page.evaluate(() => [...document.querySelectorAll("[data-sender-label]")].map((l) => l.textContent.trim()));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/inquiry-with-reply.png` });
    const backToList = await tapAndMeasure(page, '[data-testid="chat-back"]', { list: `location.pathname === "/account/orders"` });
    results.withOrders = { unreadOpensChat: marks, myOrdersOrder: order, inquiryCard: card, labels, backToList, errors: log.errors };
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
assert.equal(results.signedOut.buttonCount, 1, "one Message Us Now button");
assert.equal(results.signedOut.label.trim(), "Message Us Now");
assert.equal(results.signedOut.next, "/messages", "sign-in returns to /messages");
assert.ok(results.noOrders.chat, "no orders: lands in the General Inquiry");
assert.equal(results.noOrders.view.subject, "General Inquiry");
assert.equal(results.noOrders.view.paymentNotice, false, "no payment notice in an inquiry");
assert.equal(results.noOrders.view.orderStrip, false, "no order summary in an inquiry");
assert.equal(results.noOrders.view.covers, true, "full screen");
assert.equal(results.noOrders.view.buttonOnChat, 0, "no floating button over the chat");
assert.deepEqual(results.noOrders.sent, ["Hi! Do you sell Robux for Blox Fruits?"]);
assert.ok(results.noOrders.backToWhereTapped.home !== undefined, "Back returns to where the button was tapped");
assert.equal(results.noOrders.secondOpen.inquiryPostsTotal, 1, "the inquiry is opened once, then reused");
assert.equal(results.withOrders.myOrdersOrder[0], "inquiry-card", "General Inquiry pinned above the orders");
assert.ok(results.withOrders.labels.includes("Twicks"), "public username on support messages");
for (const scenario of [results.signedOut, results.noOrders, results.withOrders]) assert.deepEqual(scenario.errors, []);
console.log("\nGeneral Inquiry scenarios passed");
