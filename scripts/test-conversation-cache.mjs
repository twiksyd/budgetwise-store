// Conversation switching performance behaviour: cache, prefetch, parallel
// loading and race safety. Pure modules, fake network with controllable
// response order.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createConversationCache } from "../src/lib/chat/conversation-cache.mjs";
import { createConversationLoader, PREFETCH_CONCURRENCY } from "../src/lib/chat/conversation-loader.mjs";

let seq = 0;
function msg(order, n, extra = {}) {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    senderRole: "customer",
    kind: "text",
    body: `${order} #${n}`,
    clientMessageId: null,
    ...extra,
  };
}

/** fetchJson stand-in: each call waits until the test resolves it. */
function fakeNetwork() {
  const calls = [];
  const fetchJson = (url) =>
    new Promise((resolve, reject) => {
      calls.push({ url, resolve, reject });
    });
  const find = (predicate) => {
    const index = calls.findIndex((call) => !call.done && predicate(call.url));
    assert.ok(index >= 0, `expected a pending request matching ${predicate}`);
    return calls[index];
  };
  const settle = async (predicate, body) => {
    const call = find(predicate);
    call.done = true;
    call.resolve(body);
    await new Promise((r) => setImmediate(r));
  };
  const fail = async (predicate) => {
    const call = find(predicate);
    call.done = true;
    call.reject(new Error("network"));
    await new Promise((r) => setImmediate(r));
  };
  const pending = () => calls.filter((call) => !call.done).map((call) => call.url);
  return { fetchJson, calls, settle, fail, pending };
}

const isFirstPage = (order) => (url) => url === `/api/order-chat/${order}/messages?as=admin`;
const isDelta = (order) => (url) => url.startsWith(`/api/order-chat/${order}/messages?as=admin&after=`);
const isDetails = (order) => (url) => url === `/api/admin/orders/${order}/details`;
const details = (order, extra = {}) => ({ details: { order: { orderNumber: order, ...extra } } });

function setup(options = {}) {
  let clock = 1_000_000;
  const cache = createConversationCache({ now: () => clock, ...options });
  const net = fakeNetwork();
  const loader = createConversationLoader({ cache, fetchJson: net.fetchJson });
  return { cache, loader, net, advance: (ms) => (clock += ms) };
}

describe("opening a conversation", () => {
  test("messages and order details are requested in parallel, neither waits for the other", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-A");
    assert.deepEqual(net.pending().sort(), ["/api/admin/orders/BW-A/details", "/api/order-chat/BW-A/messages?as=admin"]);
    // Details can arrive first and render while messages are still loading.
    await net.settle(isDetails("BW-A"), details("BW-A"));
    assert.equal(cache.get("BW-A").details.order.orderNumber, "BW-A");
    assert.equal(cache.getThread("BW-A").loaded, false);
  });

  test("if one request fails the other still renders", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-A");
    await net.fail(isDetails("BW-A"));
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    assert.equal(cache.get("BW-A").detailsError, true);
    assert.equal(cache.getThread("BW-A").messages.length, 1);
  });

  test("revisiting a cached conversation renders it at once and fetches only newer messages", async () => {
    const { loader, net, cache, advance } = setup();
    loader.open("BW-A");
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1), msg("BW-A", 2)], hasOlder: true });
    await net.settle(isDetails("BW-A"), details("BW-A"));
    loader.open("BW-B");
    advance(60_000);
    const before = net.calls.length;
    loader.open("BW-A");
    // Cached content is there synchronously — nothing to wait for.
    assert.equal(cache.getThread("BW-A").loaded, true);
    assert.equal(cache.getThread("BW-A").messages.length, 2);
    const requested = net.calls.slice(before).map((call) => call.url);
    assert.ok(requested.some((url) => isDelta("BW-A")(url)), "delta fetch after the newest cached message");
    assert.ok(!requested.some((url) => isFirstPage("BW-A")(url)), "never the first page again");
    await net.settle(isDelta("BW-A"), { messages: [msg("BW-A", 3)] });
    assert.deepEqual(cache.getThread("BW-A").messages.map((m) => m.body), ["BW-A #1", "BW-A #2", "BW-A #3"]);
  });

  test("a fresh cached conversation is not refetched at all", async () => {
    const { loader, net } = setup();
    loader.open("BW-A");
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    await net.settle(isDetails("BW-A"), details("BW-A"));
    loader.open("BW-B");
    const before = net.calls.length;
    loader.open("BW-A");
    assert.deepEqual(net.calls.slice(before).map((c) => c.url), []);
  });

  test("background refresh keeps the current thread on screen (no reset to loading)", async () => {
    const { loader, net, cache, advance } = setup();
    loader.open("BW-A");
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    advance(60_000);
    const shown = cache.getThread("BW-A");
    loader.open("BW-A");
    assert.equal(cache.getThread("BW-A"), shown, "same thread object while the refresh is in flight");
    await net.fail(isDelta("BW-A"));
    assert.equal(cache.getThread("BW-A").messages.length, 1, "a failed refresh keeps what was shown");
  });
});

describe("rapid switching and late responses", () => {
  test("A -> B -> C: late A and B responses land only in A and B, never in C", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-A");
    loader.open("BW-B");
    loader.open("BW-C");
    assert.equal(cache.pinned, "BW-C");
    await net.settle(isFirstPage("BW-C"), { messages: [msg("BW-C", 1)], hasOlder: false });
    await net.settle(isDetails("BW-C"), details("BW-C"));
    // Slow responses for the chats we already left.
    await net.settle(isFirstPage("BW-B"), { messages: [msg("BW-B", 1)], hasOlder: false });
    await net.settle(isDetails("BW-A"), details("BW-A"));
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    await net.settle(isDetails("BW-B"), details("BW-B"));
    assert.deepEqual(cache.getThread("BW-C").messages.map((m) => m.body), ["BW-C #1"]);
    assert.equal(cache.get("BW-C").details.order.orderNumber, "BW-C");
    assert.deepEqual(cache.getThread("BW-A").messages.map((m) => m.body), ["BW-A #1"]);
    assert.equal(cache.get("BW-B").details.order.orderNumber, "BW-B");
  });

  test("an older details response cannot overwrite a newer one", async () => {
    const { loader, net, cache } = setup();
    loader.ensureDetails("BW-A");
    loader.ensureDetails("BW-A", { force: true }); // e.g. a realtime fulfillment ping
    const [first, second] = net.calls.filter((c) => isDetails("BW-A")(c.url));
    second.done = true;
    second.resolve(details("BW-A", { status: "new" }));
    await new Promise((r) => setImmediate(r));
    first.done = true;
    first.resolve(details("BW-A", { status: "old" }));
    await new Promise((r) => setImmediate(r));
    assert.equal(cache.get("BW-A").details.order.status, "new");
  });

  test("a local edit is not rolled back by a slower request", async () => {
    const { loader, net, cache } = setup();
    loader.ensureDetails("BW-A");
    cache.setDetailsLocal("BW-A", { order: { orderNumber: "BW-A", status: "edited" } });
    await net.settle(isDetails("BW-A"), details("BW-A", { status: "stale" }));
    assert.equal(cache.get("BW-A").details.order.status, "edited");
  });

  test("a realtime ping during a fetch schedules exactly one follow-up delta", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-A");
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    loader.fetchNewer("BW-A");
    loader.fetchNewer("BW-A");
    loader.fetchNewer("BW-A");
    assert.equal(net.pending().filter(isDelta("BW-A")).length, 1);
    await net.settle(isDelta("BW-A"), { messages: [msg("BW-A", 2)] });
    assert.equal(net.pending().filter(isDelta("BW-A")).length, 1, "one follow-up for the pings");
    await net.settle(isDelta("BW-A"), { messages: [] });
    assert.equal(net.pending().filter(isDelta("BW-A")).length, 0);
    assert.equal(cache.getThread("BW-A").messages.length, 2);
  });

  test("opening the same chat twice never runs two identical first-page loads", () => {
    const { loader, net } = setup();
    loader.open("BW-A");
    loader.open("BW-B");
    loader.open("BW-A");
    assert.equal(net.pending().filter(isFirstPage("BW-A")).length, 1);
    assert.equal(net.pending().filter(isDetails("BW-A")).length, 1);
  });
});

describe("prefetch", () => {
  test("hover prefetch loads the first page and details; opening it then needs no request", async () => {
    const { loader, net, cache } = setup();
    loader.prefetchNow("BW-H");
    assert.ok(net.pending().some(isFirstPage("BW-H")));
    assert.ok(net.pending().some(isDetails("BW-H")));
    await net.settle(isFirstPage("BW-H"), { messages: [msg("BW-H", 1)], hasOlder: false });
    await net.settle(isDetails("BW-H"), details("BW-H"));
    const before = net.calls.length;
    loader.open("BW-H");
    assert.equal(cache.getThread("BW-H").loaded, true, "renders immediately");
    assert.ok(cache.get("BW-H").details, "details render immediately");
    assert.equal(net.calls.length, before, "nothing to wait for");
  });

  test("prefetch never fetches older pages or attachments, only the newest page and details", async () => {
    const { loader, net } = setup();
    loader.prefetchNow("BW-H");
    for (const url of net.pending()) {
      assert.ok(!url.includes("before=") && !url.includes("attachments"), url);
    }
  });

  test("bounded: at most a few run at once, the rest wait; replaced candidates are dropped", async () => {
    const { loader, net } = setup();
    loader.prefetchCandidates(["BW-1", "BW-2", "BW-3", "BW-4", "BW-5"]);
    assert.equal(loader.activePrefetches, PREFETCH_CONCURRENCY);
    assert.deepEqual(loader.queued, ["BW-3", "BW-4", "BW-5"]);
    loader.prefetchCandidates(["BW-9"]); // the admin moved on
    assert.deepEqual(loader.queued, ["BW-9"]);
    loader.prefetchNow("BW-H"); // hover jumps the queue
    assert.deepEqual(loader.queued, ["BW-H", "BW-9"]);
    loader.prefetchCandidates(["BW-8"]);
    assert.deepEqual(loader.queued, ["BW-H", "BW-8"], "hover requests survive candidate changes");
    const urls = net.calls.map((call) => call.url);
    assert.ok(!urls.some((url) => url.includes("BW-3") || url.includes("BW-9")), "dropped items never started");
  });

  test("already cached and fresh conversations are not prefetched again", async () => {
    const { loader, net } = setup();
    loader.open("BW-A");
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    await net.settle(isDetails("BW-A"), details("BW-A"));
    const before = net.calls.length;
    loader.prefetchNow("BW-A");
    loader.prefetchCandidates(["BW-A"]);
    assert.equal(net.calls.length, before);
  });
});

describe("realtime merge into the cache", () => {
  test("a message for cached conversation B (while A is open) merges into B only", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-B");
    await net.settle(isFirstPage("BW-B"), { messages: [msg("BW-B", 1)], hasOlder: false });
    loader.open("BW-A");
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    loader.fetchNewer("BW-B"); // what the inbox does on a realtime "message" for B
    await net.settle(isDelta("BW-B"), { messages: [msg("BW-B", 2)] });
    assert.deepEqual(cache.getThread("BW-B").messages.map((m) => m.body), ["BW-B #1", "BW-B #2"]);
    assert.deepEqual(cache.getThread("BW-A").messages.map((m) => m.body), ["BW-A #1"]);
  });

  test("a message arriving while the first page is loading is fetched right after it", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-A");
    loader.fetchNewer("BW-A"); // realtime ping mid-load
    const late = msg("BW-A", 2);
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    assert.equal(net.pending().filter(isDelta("BW-A")).length, 1, "follow-up delta after the first page");
    await net.settle(isDelta("BW-A"), { messages: [late] });
    assert.equal(cache.getThread("BW-A").messages.at(-1).id, late.id);
  });

  test("a ping for a conversation that is not cached fetches nothing", () => {
    const { loader, net } = setup();
    loader.fetchNewer("BW-Z");
    assert.deepEqual(net.pending(), []);
  });

  test("duplicate deliveries do not duplicate messages", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-A");
    const first = msg("BW-A", 1);
    await net.settle(isFirstPage("BW-A"), { messages: [first], hasOlder: false });
    loader.fetchNewer("BW-A");
    await net.settle(isDelta("BW-A"), { messages: [first] });
    assert.equal(cache.getThread("BW-A").messages.length, 1);
  });

  test("after a reconnect everything cached is refreshed when next opened", async () => {
    const { loader, net, cache } = setup();
    loader.open("BW-A");
    await net.settle(isFirstPage("BW-A"), { messages: [msg("BW-A", 1)], hasOlder: false });
    await net.settle(isDetails("BW-A"), details("BW-A"));
    loader.open("BW-B");
    cache.markAllStale();
    const before = net.calls.length;
    loader.open("BW-A");
    const urls = net.calls.slice(before).map((c) => c.url);
    assert.ok(urls.some(isDelta("BW-A")) && urls.some(isDetails("BW-A")));
  });
});

describe("cache limits", () => {
  test("least recently used conversations are evicted; the open one never is", async () => {
    const { loader, net, cache } = setup({ limit: 3 });
    for (const order of ["BW-1", "BW-2", "BW-3"]) {
      loader.open(order);
      await net.settle(isFirstPage(order), { messages: [msg(order, 1)], hasOlder: false });
    }
    loader.open("BW-1"); // most recent again
    loader.open("BW-4");
    assert.deepEqual(cache.keys().sort(), ["BW-1", "BW-3", "BW-4"]);
    assert.equal(cache.size, 3);
  });

  test("a conversation with a message still sending is never evicted", () => {
    const { cache } = setup({ limit: 2 });
    cache.pin("BW-1");
    cache.dispatch("BW-1", { type: "send", item: { clientMessageId: "c1", kind: "text", body: "hi", createdAt: new Date().toISOString() } });
    cache.pin("BW-2");
    cache.pin("BW-3");
    cache.pin("BW-4");
    assert.ok(cache.has("BW-1"), "pending send keeps it");
    assert.ok(cache.has("BW-4"), "open conversation kept");
  });

  test("a response for an evicted conversation does not resurrect it", async () => {
    const { loader, net, cache } = setup({ limit: 1 });
    loader.open("BW-1");
    loader.open("BW-2");
    assert.equal(cache.has("BW-1"), false);
    await net.settle(isFirstPage("BW-1"), { messages: [msg("BW-1", 1)], hasOlder: false });
    await net.settle(isDetails("BW-1"), details("BW-1"));
    assert.equal(cache.has("BW-1"), false);
  });

  test("a long history is trimmed to its newest messages when you leave it", async () => {
    const { loader, net, cache } = setup({ inactiveMessageLimit: 10 });
    loader.open("BW-L");
    const many = Array.from({ length: 30 }, (_, i) => msg("BW-L", i));
    await net.settle(isFirstPage("BW-L"), { messages: many, hasOlder: false });
    loader.open("BW-X");
    const kept = cache.getThread("BW-L");
    assert.equal(kept.messages.length, 10);
    assert.equal(kept.messages.at(-1).body, "BW-L #29", "newest kept");
    assert.equal(kept.hasOlder, true, "older ones reload when scrolled to");
  });
});
