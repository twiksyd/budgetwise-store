// Mobile navigation profile for the customer side: Orders tab -> My Orders,
// My Orders -> Chat, Chat -> Back, repeated, on phone viewports. Measures,
// in the page itself (performance.now from the tap), when each screen's
// shell and data become visible, and records every request, full document
// load, RSC fetch and realtime join/leave.
//
// Needs no database: the customer APIs and the realtime socket are mocked
// with a configurable delay (default 800 ms per API call — what production
// costs today with functions in iad1 and the database in Singapore), so the
// numbers isolate what the CLIENT does with a tap. A placeholder session
// cookie is set that the server never reads (pages are static shells; only
// the mocked APIs see it).
//
//   E2E_BASE_URL=http://127.0.0.1:3100 node scripts/e2e/customer-nav-profile.mjs \
//     [--api=800] [--rtt=120] [--rounds=10] [--json=out.json]
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const API_MS = Number(arg("api", "800"));
const RTT = Number(arg("rtt", "120"));
const ROUNDS = Number(arg("rounds", "10"));
const JSON_OUT = arg("json", null);
const SHOTS = arg("shots", null);
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

// ---------------------------------------------------------------- fixtures
const USER = "e2e00000-0000-4000-8000-000000000001";
const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
const ORDERS = ["BW-E2E001", "BW-E2E002", "BW-E2E003"];
const COMPLETED = ["BW-E2E900"];

function card(orderNumber, i, overrides = {}) {
  return {
    orderNumber, totalAmount: 250 + i * 100, createdAt: iso(600 + i * 60), robloxUsername: `player${i}`,
    status: "pending", state: "active", doneAt: null, unreadCount: i === 0 ? 2 : 0,
    lastMessageAt: iso(5 + i * 30), lastMessagePreview: "Thanks!", lastSenderRole: i === 0 ? "admin" : "customer",
    paymentSent: i === 0, summary: `${i + 1} item${i ? "s" : ""} · Blox Fruits`, thumbnails: [], ...overrides,
  };
}
const openSection = { rows: ORDERS.map((o, i) => card(o, i)), nextCursor: null };
const completedSection = { rows: COMPLETED.map((o, i) => card(o, i + 5, { state: "done", status: "completed", doneAt: iso(3000), unreadCount: 0 })), nextCursor: null };
const conversations = [...ORDERS, ...COMPLETED].map((orderNumber, i) => ({
  conversationId: `conv-${orderNumber}`, orderNumber, state: COMPLETED.includes(orderNumber) ? "done" : "active",
  unreadCount: i === 0 ? 2 : 0, lastMessageAt: iso(5 + i * 30), lastMessagePreview: "Thanks!", lastSenderRole: i === 0 ? "admin" : "customer",
}));

function messages(orderNumber) {
  const list = [{
    id: `${orderNumber}-slip`, orderNumber, senderRole: "customer", kind: "slip", body: "", hasAttachment: false,
    createdAt: iso(300), clientMessageId: null, payment: null, album: null,
  }];
  for (let i = 0; i < 26; i += 1) {
    list.push({
      id: `${orderNumber}-m${String(i).padStart(2, "0")}`, orderNumber, senderRole: i % 2 ? "admin" : "customer", kind: "text",
      body: i % 5 === 0 ? "Long message ".repeat(20) : `Message ${i} about the order`, hasAttachment: false,
      createdAt: iso(280 - i * 10), clientMessageId: null, payment: null, album: null,
    });
  }
  list.push({
    id: `${orderNumber}-pay`, orderNumber, senderRole: "admin", kind: "payment", body: "", hasAttachment: false,
    createdAt: iso(10), clientMessageId: null, album: null,
    payment: { provider: "gcash", label: "GCash", accountName: "BudgetWise", accountNumber: "09170000000", amount: 250, currency: "PHP", hasQr: false },
  });
  return list;
}
function summary(orderNumber) {
  const i = Math.max(0, ORDERS.indexOf(orderNumber));
  return {
    summary: {
      orderNumber, conversationId: `conv-${orderNumber}`, totalAmount: 250 + i * 100, createdAt: iso(600), buyerName: "Juan",
      robloxUsername: `player${i}`, status: "pending", state: COMPLETED.includes(orderNumber) ? "done" : "active", paymentSent: true,
      itemCount: 2, summary: "2 items · Blox Fruits",
      lines: [0, 1].map((lineIndex) => ({ lineIndex, productName: `Gamepass ${lineIndex + 1}`, gameName: "Blox Fruits", quantity: 1, robuxAmount: 100, unitPrice: 125, lineTotal: 125, imageUrl: null })),
    },
    adminRead: { at: null, messageId: null },
    ownRead: { at: iso(100), messageId: `${orderNumber}-m10` },
    slots: [],
  };
}

// ---------------------------------------------------------------- harness
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openPhone(browser, viewport) {
  const context = await browser.newContext({ baseURL: BASE, viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await context.addCookies([{ name: "sb-e2e-auth-token", value: "1", url: BASE }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const log = { requests: [], documents: 0, rsc: 0, joins: [], leaves: [], errors: [], socket: null };
  /** Server-side broadcast on a topic (e.g. a new message), as Realtime sends it. */
  log.broadcast = (topic, event) =>
    log.socket?.send(JSON.stringify([null, null, `realtime:${topic}`, "broadcast", { type: "broadcast", event, payload: {} }]));
  page.on("pageerror", (error) => log.errors.push(error.message));

  const json = (route, body, status = 200) => sleep(API_MS).then(() => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }).catch(() => undefined));
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    log.requests.push({ at: Date.now(), path: path + url.search, method: route.request().method() });
    if (path === "/api/account/conversations") return json(route, { userId: USER, email: "juan@example.com", conversations });
    if (path === "/api/account/orders") return json(route, url.searchParams.get("section") === "completed" ? completedSection : openSection);
    const chat = /^\/api\/order-chat\/([^/]+)\/(\w+)/.exec(path);
    if (chat) {
      const [, orderNumber, what] = chat;
      if (what === "summary") return json(route, summary(orderNumber));
      if (what === "messages") return json(route, url.searchParams.has("after") ? { messages: [] } : { messages: messages(orderNumber), hasOlder: false });
      if (what === "read") return json(route, { cursor: {} });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
  page.on("request", (request) => {
    if (request.resourceType() === "document") log.documents += 1;
    if (request.headers()["rsc"]) log.rsc += 1;
  });
  // Realtime: acknowledge joins (protocol 2.0.0: [join_ref, ref, topic, event, payload]).
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    log.socket = ws;
    ws.onMessage((raw) => {
      let frame;
      try {
        frame = JSON.parse(String(raw));
      } catch {
        return;
      }
      const [joinRef, ref, topic, event] = Array.isArray(frame) ? frame : [frame.join_ref, frame.ref, frame.topic, frame.event];
      if (event === "phx_join") log.joins.push({ at: Date.now(), topic });
      if (event === "phx_leave") log.leaves.push({ at: Date.now(), topic });
      if (event === "phx_join" || event === "phx_leave" || event === "heartbeat") {
        ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
      }
    });
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: RTT, downloadThroughput: -1, uploadThroughput: -1 });
  return { context, page, log };
}

/** Taps `tapSelector` and reports, from the tap, when each selector first matches. */
async function tapAndMeasure(page, tapSelector, marks) {
  await page.evaluate((marks) => {
    window.__marks = null;
    window.__arm = () => {
      const t0 = performance.now();
      const found = {};
      const check = () => {
        for (const [name, selector] of Object.entries(marks)) {
          if (!(name in found) && document.querySelector(selector)) found[name] = Math.round(performance.now() - t0);
        }
        if (Object.keys(found).length === Object.keys(marks).length) window.__marks = found;
        else if (performance.now() - t0 < 20_000) requestAnimationFrame(check);
        else window.__marks = { ...found, timeout: true };
      };
      requestAnimationFrame(check);
    };
  }, marks);
  const target = page.locator(tapSelector).first();
  await target.waitFor({ state: "visible" });
  await target.evaluate((element) => element.addEventListener("pointerdown", () => window.__arm(), { once: true }));
  await target.tap();
  await page.waitForFunction(() => window.__marks, null, { timeout: 25_000 });
  return page.evaluate(() => window.__marks);
}

const SEL = {
  ordersShell: "#active-orders",
  activeOrders: '[data-testid="active-orders"] [data-order-card]',
  chatShell: "[data-messenger-screen]",
  firstMessages: "[data-messenger-screen] [data-message-id]",
};

async function layoutChecks(page) {
  return page.evaluate(() => {
    const screen = document.querySelector("[data-messenger-screen]");
    const rect = screen.getBoundingClientRect();
    const scroller = screen.querySelector(".overflow-y-auto");
    const beforeY = window.scrollY;
    window.scrollTo(0, 5000);
    const afterY = window.scrollY;
    window.scrollTo(0, beforeY);
    const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const corners = [[2, 2], [window.innerWidth - 2, 2], [2, window.innerHeight - 2], [window.innerWidth - 2, window.innerHeight - 2]]
      .map(([x, y]) => screen.contains(document.elementFromPoint(x, y)));
    return {
      covers: Math.round(rect.top) === 0 && Math.round(rect.left) === 0 && Math.round(rect.width) === window.innerWidth && Math.round(rect.height) === window.innerHeight,
      rect: { top: rect.top, height: rect.height, width: rect.width },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pageScrolls: afterY !== beforeY,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      cornersInsideChat: corners.every(Boolean),
      centerInsideChat: screen.contains(center),
      background: getComputedStyle(screen).backgroundColor,
      messagesScrollable: scroller ? scroller.scrollHeight > scroller.clientHeight : null,
      siteHeaderVisible: [...document.querySelectorAll("header")].some((h) => !screen.contains(h) && h.getBoundingClientRect().height > 0),
      floatingButtons: [...document.querySelectorAll('button[aria-label^="Messages from BudgetWise"]')].length,
    };
  });
}

async function run(viewport) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const { context, page, log } = await openPhone(browser, viewport);
  const results = { viewport, apiMs: API_MS, rttMs: RTT, rounds: [] };

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Header "Orders" tab (cold: nothing cached yet).
  results.ordersCold = await tapAndMeasure(page, 'header a[href="/account/orders"]:visible', { shell: SEL.ordersShell, active: SEL.activeOrders });
  // A person reads the list for a moment before tapping a chat.
  await sleep(1500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/orders-${viewport.width}.png` });

  for (let round = 0; round < ROUNDS; round += 1) {
    const order = ORDERS[round % 2];
    const chat = await tapAndMeasure(page, `[data-order-card="${order}"]`, { shell: SEL.chatShell, messages: SEL.firstMessages });
    if (round === 0) {
      results.layout = await layoutChecks(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/chat-${viewport.width}.png` });
      // Keyboard: focusing the composer must keep it inside the visible screen.
      await page.locator("[data-messenger-screen] textarea").first().tap();
      results.composerVisible = await page.evaluate(() => {
        const box = document.querySelector("[data-messenger-screen] textarea").getBoundingClientRect();
        return box.bottom <= window.innerHeight && box.top >= 0;
      });
      // Keyboard open (visual viewport shrinks by ~40%): the screen follows it.
      await page.setViewportSize({ width: viewport.width, height: Math.round(viewport.height * 0.58) });
      await sleep(150);
      results.keyboard = await page.evaluate(() => {
        const screen = document.querySelector("[data-messenger-screen]").getBoundingClientRect();
        const composer = document.querySelector("[data-messenger-screen] textarea").getBoundingClientRect();
        return { screenFits: Math.round(screen.bottom) === window.innerHeight, composerAboveKeyboard: composer.bottom <= window.innerHeight };
      });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/chat-keyboard-${viewport.width}.png` });
      await page.setViewportSize(viewport);
      await page.locator("[data-messenger-screen] textarea").first().blur();
    }
    results.reconnectingShown = (results.reconnectingShown ?? 0) + (await page.locator('[data-connection="reconnecting"]').count());
    const back = await tapAndMeasure(page, '[data-testid="chat-back"]', { shell: SEL.ordersShell, active: SEL.activeOrders });
    results.rounds.push({ order, chat, back });
  }

  // A reply arrives while the chat is closed (its channel lingering): the
  // next open must fetch what is new.
  const deltas = () => log.requests.filter((r) => r.path.startsWith(`/api/order-chat/${ORDERS[0]}/messages`) && r.path.includes("after=")).length;
  const before = deltas();
  log.broadcast(`chat:conv-${ORDERS[0]}`, "message");
  await sleep(200);
  await page.locator(`[data-order-card="${ORDERS[0]}"]`).first().tap();
  await page.waitForSelector(SEL.firstMessages);
  await sleep(API_MS + 400);
  results.catchUpAfterMissedEvent = deltas() - before;
  await page.locator('[data-testid="chat-back"]').tap();
  await page.waitForSelector(SEL.activeOrders);

  // Browser back / forward between the two screens.
  await page.locator(`[data-order-card="${ORDERS[0]}"]`).first().tap();
  await page.waitForSelector(SEL.firstMessages);
  await page.goBack();
  await page.waitForSelector(SEL.activeOrders);
  results.browserBackOk = new URL(page.url()).pathname === "/account/orders";
  await page.goForward();
  await page.waitForSelector(SEL.firstMessages);
  results.browserForwardOk = new URL(page.url()).pathname === `/orders/${ORDERS[0]}`;

  results.requests = log.requests.length;
  results.requestsByPath = log.requests.reduce((acc, r) => ({ ...acc, [r.path.split("?")[0]]: (acc[r.path.split("?")[0]] ?? 0) + 1 }), {});
  results.documentLoads = log.documents;
  results.rscFetches = log.rsc;
  results.joins = log.joins.map((j) => j.topic);
  results.leaves = log.leaves.map((j) => j.topic);
  results.errors = log.errors;
  await context.close();
  await browser.close();
  return results;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const max = (values) => Math.max(...values);

const all = [];
for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  const result = await run(viewport);
  all.push(result);
  const first = result.rounds[0];
  const warm = result.rounds.slice(1);
  console.log(`\n=== ${viewport.width}x${viewport.height} (API ${API_MS} ms, RTT ${RTT} ms, ${ROUNDS} round trips)`);
  console.log("Orders tab -> shell / active orders (cold):", result.ordersCold);
  console.log("Chat (first open)  -> shell / first messages:", first.chat);
  console.log("Back (first)       -> Orders shell / active orders:", first.back);
  console.log("Chat warm   shell median/max:", median(warm.map((r) => r.chat.shell)), max(warm.map((r) => r.chat.shell)),
    " messages median/max:", median(warm.map((r) => r.chat.messages)), max(warm.map((r) => r.chat.messages)));
  console.log("Back warm   shell median/max:", median(warm.map((r) => r.back.shell)), max(warm.map((r) => r.back.shell)),
    " active median/max:", median(warm.map((r) => r.back.active)), max(warm.map((r) => r.back.active)));
  console.log("Layout:", result.layout, "composer visible after focus:", result.composerVisible, "keyboard:", result.keyboard);
  console.log("Browser back/forward ok:", result.browserBackOk, result.browserForwardOk);
  console.log("Document loads:", result.documentLoads, " RSC fetches:", result.rscFetches, " API requests:", result.requests);
  console.log("Requests by path:", result.requestsByPath);
  console.log("Realtime joins:", result.joins, " leaves:", result.leaves);
  console.log("'Reconnecting' badges seen:", result.reconnectingShown, " catch-up fetches after a missed event:", result.catchUpAfterMissedEvent);
  if (result.errors.length) console.log("Page errors:", result.errors);
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all, null, 2));
