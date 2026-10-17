// Measures conversation switching in the admin inbox from the outside, the
// way an admin experiences it: click a row, then time until the header,
// thread and order panel show THAT conversation. Also records every request
// made during the switch, realtime channel joins, and whether the inbox list
// was remounted. Runs against a LOCAL stack only.
//
//   E2E_BASE_URL=http://127.0.0.1:3100 E2E_SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/e2e/inbox-switch-profile.mjs [--latency=80] [--json=out.json]
import { chromium } from "playwright-core";
import { PASSWORD, USERS, seed, seedPeak } from "./seed-local.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const BROWSER_LATENCY = Number(arg("latency", "80"));
const JSON_OUT = arg("json", null);

export async function openAdmin(browser, key = "robert", { latency = BROWSER_LATENCY } = {}) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(USERS[key].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Customers bounce off /admin with a session cookie set — enough for API calls.
  await page.waitForURL((url) => !url.pathname.endsWith("/admin/login") || url.search.includes("denied"));
  if (latency > 0) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency, downloadThroughput: -1, uploadThroughput: -1,
    });
  }
  return { context, page };
}

/** Wires request/websocket recorders onto a page. */
export function instrument(page) {
  const log = { requests: [], joins: 0, leaves: 0 };
  const byRequest = new Map();
  page.on("request", (request) => {
    const url = new URL(request.url());
    const rsc = Boolean(request.headers()["rsc"] || url.searchParams.has("_rsc"));
    if (!url.pathname.startsWith("/api/") && !rsc) return;
    const entry = { path: url.pathname + url.search, method: request.method(), start: Date.now(), end: null, failed: null, rsc };
    log.requests.push(entry);
    byRequest.set(request, entry);
  });
  page.on("requestfinished", (request) => {
    const entry = byRequest.get(request);
    if (entry) entry.end = Date.now();
  });
  page.on("requestfailed", (request) => {
    const entry = byRequest.get(request);
    if (entry) {
      entry.end = Date.now();
      entry.failed = request.failure()?.errorText ?? "failed";
    }
  });
  page.on("websocket", (ws) => {
    ws.on("framesent", ({ payload }) => {
      const text = String(payload);
      if (text.includes('"phx_join"') && !text.includes('"phoenix"')) log.joins += 1;
      if (text.includes('"phx_leave"')) log.leaves += 1;
    });
  });
  return log;
}

function rowLink(page, orderNumber) {
  return page.locator(`a[href="/admin/orders/${orderNumber}"]`);
}

/**
 * Clicks a conversation and polls the DOM every animation frame until the
 * header, thread and details all show it. Also flags any frame where the
 * screen showed a DIFFERENT conversation's thread or details after the click.
 */
export async function switchTo(page, log, target, { others = [] } = {}) {
  const startIndex = log.requests.length;
  const t0 = Date.now();
  await rowLink(page, target.orderNumber).click();
  const result = await page.evaluate(
    async ({ target, others, t0 }) => {
      const out = { selected: null, header: null, thread: null, details: null, stale: [] };
      const deadline = performance.now() + 20_000;
      const offset = Date.now() - t0;
      const since = () => Math.round(performance.now() - start + offset);
      const start = performance.now();
      while (performance.now() < deadline) {
        const row = document.querySelector(`a[href="/admin/orders/${target.orderNumber}"]`);
        if (out.selected === null && row?.getAttribute("aria-current") === "page") out.selected = since();
        const chat = document.querySelector(`section[aria-label^="Chat with"]`);
        if (out.header === null && chat?.getAttribute("aria-label") === `Chat with ${target.name}`) out.header = since();
        const log = document.querySelector('[role="log"]');
        const text = log?.innerText ?? "";
        if (out.thread === null && text.includes(`LAST-${target.orderNumber}`)) out.thread = since();
        const panel = document.querySelector('aside[aria-label="Order details"]');
        const panelText = panel?.innerText ?? "";
        if (out.details === null && panelText.includes(target.roblox)) out.details = since();
        for (const other of others) {
          if (text.includes(`LAST-${other.orderNumber}`) && out.header !== null) out.stale.push(`thread:${other.orderNumber}@${since()}`);
          if (panelText.includes(other.roblox) && out.header !== null) out.stale.push(`details:${other.orderNumber}@${since()}`);
        }
        if (out.selected !== null && out.header !== null && out.thread !== null && out.details !== null) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return out;
    },
    { target, others, t0 },
  );
  await page.waitForTimeout(1200); // let background refreshes finish for the request log
  const requests = log.requests.slice(startIndex).map((r) => ({
    path: r.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>"),
    method: r.method,
    rsc: r.rsc,
    startMs: r.start - t0,
    endMs: r.end ? r.end - t0 : null,
  }));
  return { ...result, requests };
}

async function markList(page) {
  await page.evaluate(() => {
    const list = document.querySelector('[role="tablist"][aria-label="Filter chats"]');
    if (list) list.__perfMarker = "kept";
  });
}
async function listKept(page) {
  return page.evaluate(() => document.querySelector('[role="tablist"][aria-label="Filter chats"]')?.__perfMarker === "kept");
}

function summarize(label, r) {
  const blocking = r.requests.filter((q) => q.startMs < (r.thread ?? 0) || q.startMs < (r.details ?? 0));
  return {
    label,
    selectedMs: r.selected, headerMs: r.header, threadMs: r.thread, detailsMs: r.details,
    requestsTotal: r.requests.length,
    rscRequests: r.requests.filter((q) => q.rsc).length,
    requestsBeforeContent: blocking.length,
    stale: r.stale,
    requests: r.requests,
  };
}

export async function runProfile() {
  const ids = await seed();
  const peak = await seedPeak(ids);
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  const { page } = await openAdmin(browser);
  const log = instrument(page);
  const loadStart = Date.now();
  await page.goto("/admin/orders");
  await rowLink(page, peak.at(-1).orderNumber).waitFor();
  await page.getByRole("status").filter({ hasText: "Live" }).first().waitFor();
  const inboxLoadMs = Date.now() - loadStart;
  await page.waitForTimeout(1500);
  await markList(page);
  const joinsAtStart = log.joins;

  // Newest first in the list: peak[34], peak[33], ...
  const [a, b, c, d, e] = [peak[34], peak[33], peak[32], peak[31], peak[30]];
  const long = peak[25]; // 300-message history
  const steps = [];
  steps.push(summarize("first open A", await switchTo(page, log, a)));
  steps.push(summarize("first open B (never opened)", await switchTo(page, log, b, { others: [a] })));
  steps.push(summarize("revisit A (opened before)", await switchTo(page, log, a, { others: [b] })));
  steps.push(summarize("first open long history (300 msgs)", await switchTo(page, log, long, { others: [a, b] })));

  // Hovered for a moment before clicking (prefetch on hover).
  const hovered = peak[12];
  await rowLink(page, hovered.orderNumber).scrollIntoViewIfNeeded();
  await rowLink(page, hovered.orderNumber).hover();
  await page.waitForTimeout(800);
  steps.push(summarize("open after hovering it", await switchTo(page, log, hovered, { others: [long, a, b] })));
  // The row right below the open one (likely-next prefetch).
  await page.waitForTimeout(1200);
  steps.push(summarize("open the next row down", await switchTo(page, log, peak[11], { others: [hovered, long] })));

  // Rapid A -> B -> C within one second: final screen must be C, never A/B.
  await rowLink(page, d.orderNumber).click();
  await page.waitForTimeout(150);
  await rowLink(page, e.orderNumber).click();
  await page.waitForTimeout(150);
  steps.push(summarize("rapid D -> E -> C (C final)", await switchTo(page, log, c, { others: [d, e, long] })));

  // Ten switches back to back.
  const ten = peak.slice(20, 30).reverse();
  const tenTimes = [];
  for (const target of ten) {
    const r = await switchTo(page, log, target, { others: ten.filter((t) => t !== target) });
    tenTimes.push({ order: target.orderNumber, threadMs: r.thread, detailsMs: r.details, stale: r.stale.length });
  }

  // Peak hour: two more admins online, a customer posting every 300 ms to
  // random chats, Robert switching through 20 chats and replying in some.
  const others = [];
  for (const key of ["andre", "kenneth"]) {
    const other = await openAdmin(browser, key);
    await other.page.goto("/admin/orders");
    others.push(other);
  }
  const customer = await openAdmin(browser, "custa", { latency: 0 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const heapBefore = (await cdp.send("Runtime.getHeapUsage")).usedSize;
  let posting = true;
  let posted = 0;
  const poster = (async () => {
    while (posting) {
      const target = peak[Math.floor(Math.random() * peak.length)];
      await customer.page.evaluate(async ({ order, n }) => {
        await fetch(`/api/order-chat/${order}/messages?as=customer`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: `peak traffic ${n}`, clientMessageId: crypto.randomUUID() }),
        });
      }, { order: target.orderNumber, n: posted });
      posted += 1;
      await new Promise((r) => setTimeout(r, 300));
    }
  })();
  const peakTimes = [];
  const peakTargets = [...peak.slice(14, 34)].reverse(); // all within the first loaded page
  for (const [i, target] of peakTargets.entries()) {
    const r = await switchTo(page, log, target, { others: peakTargets.filter((t) => t !== target) });
    peakTimes.push({ threadMs: r.thread, detailsMs: r.details, stale: r.stale.length });
    if (i % 4 === 0) {
      const box = page.getByLabel("Message", { exact: true });
      await box.fill(`admin reply ${i}`);
      await box.press("Enter");
    }
  }
  posting = false;
  await poster;
  await page.waitForTimeout(2500);
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[data-message-id]")].map((n) => n.getAttribute("data-message-id"));
    return ids.length - new Set(ids).size;
  });
  await cdp.send("HeapProfiler.collectGarbage");
  const heapAfter = (await cdp.send("Runtime.getHeapUsage")).usedSize;
  const openSockets = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("/realtime/")).length);
  for (const other of others) await other.context.close();
  await customer.context.close();

  const report = {
    browserLatencyMs: BROWSER_LATENCY,
    inboxLoadMs,
    listKeptMounted: await listKept(page),
    realtimeJoinsDuringSwitching: log.joins - joinsAtStart,
    realtimeLeavesDuringSwitching: log.leaves,
    steps,
    tenSwitches: tenTimes,
    peak: {
      customerMessagesPosted: posted,
      switches: peakTimes,
      staleFrames: peakTimes.reduce((sum, t) => sum + t.stale, 0),
      duplicateMessagesOnScreen: duplicates,
      heapBeforeMb: +(heapBefore / 1e6).toFixed(1),
      heapAfterMb: +(heapAfter / 1e6).toFixed(1),
      realtimeConnectionsOpened: openSockets,
      realtimeJoinsTotal: log.joins - joinsAtStart,
      requestsStillPending: log.requests.filter((r) => r.end === null && !r.path.includes("/signal")).length,
      failedRequests: log.requests.filter((r) => r.failed && !r.path.includes("/signal")).map((r) => `${r.method} ${r.path} ${r.failed}`),
      pendingPaths: log.requests.filter((r) => r.end === null && !r.path.includes("/signal")).map((r) => `${r.method} ${r.path} +${Date.now() - r.start}ms`),
    },
  };
  await browser.close();
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runProfile();
  const { writeFileSync } = await import("node:fs");
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  for (const step of report.steps) {
    console.log(`${step.label}: selected ${step.selectedMs}ms, header ${step.headerMs}ms, thread ${step.threadMs}ms, details ${step.detailsMs}ms, requests ${step.requestsTotal} (rsc ${step.rscRequests}), stale ${step.stale.length}`);
    for (const q of step.requests) console.log(`    ${q.method} ${q.rsc ? "[RSC] " : ""}${q.path}  ${q.startMs}->${q.endMs}ms`);
  }
  console.log("ten switches:", report.tenSwitches.map((t) => `${t.threadMs}/${t.detailsMs}${t.stale ? " STALE" : ""}`).join("  "));
  const p = report.peak;
  console.log(`peak: ${p.customerMessagesPosted} customer messages during ${p.switches.length} switches; thread ms ${p.switches.map((t) => t.threadMs).join(" ")}; stale frames ${p.staleFrames}; duplicates on screen ${p.duplicateMessagesOnScreen}; heap ${p.heapBeforeMb}MB -> ${p.heapAfterMb}MB; realtime joins ${p.realtimeJoinsTotal}; requests still pending ${p.requestsStillPending} ${JSON.stringify(p.pendingPaths)}; failed ${JSON.stringify(p.failedRequests)}`);
  console.log(`inbox load ${report.inboxLoadMs}ms, list kept mounted: ${report.listKeptMounted}, realtime joins during switching: ${report.realtimeJoinsDuringSwitching}, leaves: ${report.realtimeLeavesDuringSwitching}`);
}
