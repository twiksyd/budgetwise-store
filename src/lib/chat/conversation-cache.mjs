// Client-side cache of conversations the admin has opened or is likely to
// open next: each entry holds that conversation's thread (messages, pending
// sends) and its order details. Every update names the conversation it is
// for, so a late response for A can only ever land in A's entry — never in
// whatever conversation happens to be on screen.
//
// Bounded (LRU): the open conversation and any entry with a message still
// being sent are never evicted. Entries leaving the screen are trimmed to
// their newest messages, so a long history read once does not stay in
// memory for the rest of the shift.
import { initialThread, threadReducer } from "./thread-state.mjs";

export const CONVERSATION_CACHE_LIMIT = 30;
export const INACTIVE_MESSAGE_LIMIT = 150;
export const DETAILS_STALE_MS = 30_000;
export const THREAD_STALE_MS = 30_000;

function emptyEntry(orderNumber) {
  return {
    orderNumber,
    thread: initialThread,
    threadFetchedAt: 0,
    threadStale: false,
    threadError: false,
    details: null,
    detailsFetchedAt: 0,
    detailsStale: false,
    detailsError: false,
    // Highest request number issued / applied for details. A response is
    // applied only if it is newer than what is on screen.
    detailsIssued: 0,
    detailsApplied: 0,
  };
}

export function createConversationCache({
  limit = CONVERSATION_CACHE_LIMIT,
  inactiveMessageLimit = INACTIVE_MESSAGE_LIMIT,
  now = () => Date.now(),
} = {}) {
  /** Map order => entry. Map order doubles as recency (oldest first). */
  const entries = new Map();
  const listeners = new Set();
  let pinned = null;
  let version = 0;

  // Side tables that must survive remounts of the view (retry of a failed
  // upload needs the original file; in-flight ids stop double posts).
  const files = new Map();
  const inFlight = new Set();

  function emit() {
    version += 1;
    for (const listener of listeners) listener();
  }

  function put(orderNumber, entry) {
    entries.set(orderNumber, entry);
  }

  function touch(orderNumber) {
    const entry = entries.get(orderNumber) ?? emptyEntry(orderNumber);
    entries.delete(orderNumber);
    entries.set(orderNumber, entry);
    evict();
    return entry;
  }

  function evict() {
    if (entries.size <= limit) return;
    for (const [orderNumber, entry] of entries) {
      if (entries.size <= limit) break;
      if (orderNumber === pinned || entry.thread.pending.length > 0) continue;
      entries.delete(orderNumber);
    }
  }

  function trim(entry) {
    const { messages } = entry.thread;
    if (messages.length <= inactiveMessageLimit) return entry;
    return {
      ...entry,
      thread: {
        ...entry.thread,
        messages: messages.slice(messages.length - inactiveMessageLimit),
        hasOlder: true,
        loadingOlder: false,
      },
    };
  }

  /**
   * Updates one conversation. `create: false` drops the update when that
   * conversation is no longer cached (e.g. a prefetch finishing after it was
   * evicted) instead of resurrecting it.
   */
  function update(orderNumber, fn, { create = true } = {}) {
    const current = entries.get(orderNumber);
    if (!current && !create) return false;
    const next = fn(current ?? emptyEntry(orderNumber));
    if (next === current) return false;
    put(orderNumber, next);
    if (!current) evict();
    emit();
    return true;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
    get: (orderNumber) => entries.get(orderNumber),
    has: (orderNumber) => entries.has(orderNumber),
    keys: () => [...entries.keys()],
    get size() {
      return entries.size;
    },
    get pinned() {
      return pinned;
    },
    files,
    inFlight,

    /** The conversation on screen: never evicted; the previous one is trimmed. */
    pin(orderNumber) {
      if (pinned === orderNumber) return;
      const previous = pinned;
      pinned = orderNumber;
      if (previous && entries.has(previous)) {
        const trimmed = trim(entries.get(previous));
        if (trimmed !== entries.get(previous)) put(previous, trimmed);
      }
      if (orderNumber) touch(orderNumber);
      emit();
    },

    /** Marks a conversation as recently used (hover, prefetch, open). */
    touch(orderNumber) {
      const existed = entries.has(orderNumber);
      touch(orderNumber);
      if (!existed) emit();
    },

    // ---- thread
    getThread: (orderNumber) => entries.get(orderNumber)?.thread ?? initialThread,

    /** Applies a thread action (see thread-state.mjs) to ONE conversation. */
    dispatch(orderNumber, action, options) {
      // Sends always keep their conversation cached until they settle.
      const create = options?.create ?? (action.type === "send" || action.type === "confirmed" || action.type === "failed");
      return update(
        orderNumber,
        (entry) => {
          const thread = threadReducer(entry.thread, action);
          const fetched = action.type === "loaded" || action.type === "received";
          if (thread === entry.thread && !fetched) return entry;
          return {
            ...entry,
            thread,
            ...(fetched ? { threadFetchedAt: now(), threadStale: false, threadError: false } : {}),
          };
        },
        { create },
      );
    },

    threadFailed(orderNumber) {
      update(orderNumber, (entry) => ({ ...entry, threadError: true }), { create: false });
    },

    /** Realtime says this thread has something newer than the cache. */
    markThreadStale(orderNumber) {
      return update(
        orderNumber,
        (entry) => (entry.threadStale ? entry : { ...entry, threadStale: true }),
        { create: false },
      );
    },

    isThreadFresh(orderNumber, maxAgeMs = THREAD_STALE_MS) {
      const entry = entries.get(orderNumber);
      return Boolean(
        entry && entry.thread.loaded && !entry.threadStale && now() - entry.threadFetchedAt < maxAgeMs,
      );
    },

    // ---- details
    /** Starts a details request; pass the returned ticket to setDetails. */
    beginDetails(orderNumber) {
      const entry = touch(orderNumber);
      const ticket = entry.detailsIssued + 1;
      put(orderNumber, { ...entries.get(orderNumber), detailsIssued: ticket });
      return ticket;
    },

    /**
     * Applies details from a request. Ignored if a newer request (or a local
     * edit) has already been applied — a slow response can't roll it back.
     */
    setDetails(orderNumber, details, ticket) {
      return update(
        orderNumber,
        (entry) =>
          ticket <= entry.detailsApplied
            ? entry
            : {
                ...entry,
                details,
                detailsApplied: ticket,
                detailsFetchedAt: now(),
                detailsStale: false,
                detailsError: false,
              },
        { create: false },
      );
    },

    /** A local edit (assignment, correction) — newer than any request in flight. */
    setDetailsLocal(orderNumber, details) {
      return update(orderNumber, (entry) => {
        const ticket = entry.detailsIssued + 1;
        return {
          ...entry,
          details,
          detailsIssued: ticket,
          detailsApplied: ticket,
          detailsFetchedAt: now(),
          detailsStale: false,
          detailsError: false,
        };
      });
    },

    detailsFailed(orderNumber, ticket) {
      update(
        orderNumber,
        (entry) => (ticket < entry.detailsIssued ? entry : { ...entry, detailsError: true }),
        { create: false },
      );
    },

    markDetailsStale(orderNumber) {
      return update(
        orderNumber,
        (entry) => (entry.detailsStale ? entry : { ...entry, detailsStale: true }),
        { create: false },
      );
    },

    isDetailsFresh(orderNumber, maxAgeMs = DETAILS_STALE_MS) {
      const entry = entries.get(orderNumber);
      return Boolean(
        entry && entry.details && !entry.detailsStale && now() - entry.detailsFetchedAt < maxAgeMs,
      );
    },

    /** Everything stale (after a reconnect); refreshed when next opened. */
    markAllStale() {
      let changed = false;
      for (const [orderNumber, entry] of entries) {
        if (entry.threadStale && entry.detailsStale) continue;
        put(orderNumber, { ...entry, threadStale: entry.thread.loaded, detailsStale: Boolean(entry.details) });
        changed = true;
      }
      if (changed) emit();
    },
  };
}
