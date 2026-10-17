// Loads conversations into a conversation cache (conversation-cache.mjs).
//
//   open(order)      thread + details requested AT THE SAME TIME; cached data
//                    stays on screen while they refresh in the background
//   prefetch(order)  same requests at low priority (hover, focus, next rows)
//   fetchNewer(order) delta only (messages after the newest one cached)
//
// Requests are coalesced per conversation: opening A twice, or a realtime
// ping during a fetch, never runs two identical fetches side by side — a
// ping during a fetch schedules exactly one follow-up. `fetchJson` is
// injected so the ordering and race behaviour can be unit tested.
import { DETAILS_STALE_MS } from "./conversation-cache.mjs";
import { newestMessageId, oldestMessageId } from "./thread-state.mjs";

export const OPEN_THREAD_MAX_AGE_MS = 10_000;
export const PREFETCH_CONCURRENCY = 2;
export const PREFETCH_QUEUE_LIMIT = 8;

export function createConversationLoader({
  cache,
  fetchJson,
  viewer = "admin",
  detailsUrl = (orderNumber) => `/api/admin/orders/${encodeURIComponent(orderNumber)}/details`,
  pickDetails = (body) => body.details,
}) {
  const threadUrl = (orderNumber) =>
    `/api/order-chat/${encodeURIComponent(orderNumber)}/messages?as=${viewer}`;

  // ---- thread: one job per conversation; `dirty` = run once more after it.
  const threadJobs = new Map();

  function runThreadJob(orderNumber) {
    const existing = threadJobs.get(orderNumber);
    if (existing) {
      existing.dirty = true;
      return existing.promise;
    }
    const job = { dirty: false, promise: null };
    job.promise = (async () => {
      try {
        do {
          job.dirty = false;
          const thread = cache.getThread(orderNumber);
          const newest = newestMessageId(thread);
          if (!thread.loaded || !newest) {
            const body = await fetchJson(threadUrl(orderNumber));
            cache.dispatch(
              orderNumber,
              { type: "loaded", messages: body.messages ?? [], hasOlder: Boolean(body.hasOlder) },
              { create: false },
            );
          } else {
            const body = await fetchJson(`${threadUrl(orderNumber)}&after=${newest}`);
            cache.dispatch(orderNumber, { type: "received", messages: body.messages ?? [] }, { create: false });
          }
        } while (job.dirty && cache.has(orderNumber));
      } catch {
        cache.threadFailed(orderNumber);
      } finally {
        threadJobs.delete(orderNumber);
      }
    })();
    threadJobs.set(orderNumber, job);
    return job.promise;
  }

  function ensureThread(orderNumber, { maxAgeMs = OPEN_THREAD_MAX_AGE_MS } = {}) {
    if (cache.isThreadFresh(orderNumber, maxAgeMs)) return Promise.resolve();
    const running = threadJobs.get(orderNumber);
    // A first-page load already in flight is exactly what we need.
    if (running && !cache.getThread(orderNumber).loaded) return running.promise;
    return runThreadJob(orderNumber);
  }

  async function loadOlder(orderNumber) {
    const thread = cache.getThread(orderNumber);
    const oldest = oldestMessageId(thread);
    if (!thread.hasOlder || thread.loadingOlder || !oldest) return;
    cache.dispatch(orderNumber, { type: "loading_older" }, { create: false });
    try {
      const body = await fetchJson(`${threadUrl(orderNumber)}&before=${oldest}`);
      cache.dispatch(
        orderNumber,
        { type: "older", messages: body.messages ?? [], hasOlder: Boolean(body.hasOlder) },
        { create: false },
      );
    } catch {
      cache.dispatch(orderNumber, { type: "older", messages: [], hasOlder: true }, { create: false });
    }
  }

  // ---- details: newest request wins (tickets), one in flight per conversation.
  const detailJobs = new Map();

  function ensureDetails(orderNumber, { maxAgeMs = DETAILS_STALE_MS, force = false } = {}) {
    if (!force && cache.isDetailsFresh(orderNumber, maxAgeMs)) return Promise.resolve();
    const running = detailJobs.get(orderNumber);
    if (running && !force) return running;
    const ticket = cache.beginDetails(orderNumber);
    const promise = fetchJson(detailsUrl(orderNumber))
      .then((body) => {
        cache.setDetails(orderNumber, pickDetails(body), ticket);
      })
      .catch(() => cache.detailsFailed(orderNumber, ticket))
      .finally(() => {
        if (detailJobs.get(orderNumber) === promise) detailJobs.delete(orderNumber);
      });
    detailJobs.set(orderNumber, promise);
    return promise;
  }

  // ---- prefetch queue (bounded; dropped items are never started)
  const queue = []; // { orderNumber, urgent }
  let active = 0;
  const indexOf = (orderNumber) => queue.findIndex((item) => item.orderNumber === orderNumber);

  function pump() {
    while (active < PREFETCH_CONCURRENCY && queue.length) {
      const { orderNumber } = queue.shift();
      if (!cache.has(orderNumber)) cache.touch(orderNumber);
      const work = [];
      if (!cache.getThread(orderNumber).loaded) work.push(ensureThread(orderNumber));
      if (!cache.isDetailsFresh(orderNumber)) work.push(ensureDetails(orderNumber));
      if (!work.length) continue;
      active += 1;
      Promise.allSettled(work).finally(() => {
        active -= 1;
        pump();
      });
    }
  }

  function needsPrefetch(orderNumber) {
    const entry = cache.get(orderNumber);
    return !entry || !entry.thread.loaded || !cache.isDetailsFresh(orderNumber);
  }

  return {
    ensureThread,
    ensureDetails,
    /**
     * Realtime ping: pull what is newer than the cache. If the first page is
     * still loading, one delta runs right after it (the ping may describe a
     * message the first page was read too early to include).
     */
    fetchNewer: (orderNumber) =>
      cache.getThread(orderNumber).loaded || threadJobs.has(orderNumber)
        ? runThreadJob(orderNumber)
        : Promise.resolve(),
    loadOlder,

    /**
     * Opening a conversation: both requests start immediately and in
     * parallel; neither waits for the other, and neither blocks rendering
     * of what is already cached.
     */
    open(orderNumber) {
      cache.pin(orderNumber);
      const index = indexOf(orderNumber);
      if (index >= 0) queue.splice(index, 1);
      return {
        thread: ensureThread(orderNumber),
        details: ensureDetails(orderNumber),
      };
    },

    /** Hover / keyboard focus: jumps the queue. */
    prefetchNow(orderNumber) {
      if (!needsPrefetch(orderNumber)) return;
      const index = indexOf(orderNumber);
      if (index >= 0) queue.splice(index, 1);
      queue.unshift({ orderNumber, urgent: true });
      queue.length = Math.min(queue.length, PREFETCH_QUEUE_LIMIT);
      pump();
    },

    /**
     * Likely-next conversations. Replaces earlier candidates that have not
     * started yet (hover/focus requests stay at the front).
     */
    prefetchCandidates(orderNumbers) {
      const urgent = queue.filter((item) => item.urgent);
      const taken = new Set(urgent.map((item) => item.orderNumber));
      const wanted = orderNumbers
        .filter((orderNumber) => !taken.has(orderNumber) && needsPrefetch(orderNumber))
        .map((orderNumber) => ({ orderNumber, urgent: false }));
      queue.length = 0;
      queue.push(...[...urgent, ...wanted].slice(0, PREFETCH_QUEUE_LIMIT));
      pump();
    },

    /** For tests / diagnostics. */
    get queued() {
      return queue.map((item) => item.orderNumber);
    },
    get activePrefetches() {
      return active;
    },
  };
}
