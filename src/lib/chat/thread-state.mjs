// One open chat thread: confirmed messages (exact server order), optimistic
// sends, older-page loading, and display grouping.
import { comparePositions, isAtOrBefore } from "./cursor.mjs";

export const initialThread = Object.freeze({
  messages: [],
  pending: [],
  hasOlder: false,
  loadingOlder: false,
  loaded: false,
});

export function mergeMessages(current, incoming) {
  if (!incoming || incoming.length === 0) return current;
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(comparePositions);
}

function dropReconciled(pending, messages) {
  const ids = new Set(
    messages.map((message) => message.clientMessageId).filter(Boolean),
  );
  return ids.size ? pending.filter((item) => !ids.has(item.clientMessageId)) : pending;
}

/**
 * Actions:
 *   loaded   { messages, hasOlder }      first page (newest)
 *   loading_older
 *   older    { messages, hasOlder }      page before the oldest loaded
 *   received { messages }                delta / realtime-triggered fetch
 *   send     { item }                    optimistic { clientMessageId, kind, body, previewUrl?, createdAt }
 *                                        albums: kind "album", previews[], label
 *   progress { clientMessageId, progress, uploaded? }
 *   failed   { clientMessageId, error, failedFiles? }
 *   retry    { clientMessageId }
 *   discard  { clientMessageId }
 *   confirmed{ clientMessageId, message } server accepted (also dedupes replays)
 */
export function threadReducer(state, action) {
  switch (action.type) {
    case "loaded": {
      const messages = mergeMessages(state.messages, action.messages);
      return {
        ...state,
        messages,
        pending: dropReconciled(state.pending, messages),
        hasOlder: action.hasOlder,
        loaded: true,
      };
    }
    case "loading_older":
      return { ...state, loadingOlder: true };
    case "older":
      return {
        ...state,
        messages: mergeMessages(state.messages, action.messages),
        hasOlder: action.hasOlder,
        loadingOlder: false,
      };
    case "received": {
      const messages = mergeMessages(state.messages, action.messages);
      return { ...state, messages, pending: dropReconciled(state.pending, action.messages) };
    }
    case "send":
      if (state.pending.some((item) => item.clientMessageId === action.item.clientMessageId)) {
        return state; // the same intended message is already in flight
      }
      return {
        ...state,
        pending: [
          ...state.pending,
          { progress: 0, uploaded: 0, status: "sending", error: null, failedFiles: [], ...action.item },
        ],
      };
    case "progress":
      return {
        ...state,
        pending: state.pending.map((item) =>
          item.clientMessageId === action.clientMessageId
            ? { ...item, progress: action.progress, uploaded: action.uploaded ?? item.uploaded }
            : item,
        ),
      };
    case "failed":
      return {
        ...state,
        pending: state.pending.map((item) =>
          item.clientMessageId === action.clientMessageId
            ? { ...item, status: "failed", error: action.error, failedFiles: action.failedFiles ?? [] }
            : item,
        ),
      };
    case "retry":
      return {
        ...state,
        pending: state.pending.map((item) =>
          item.clientMessageId === action.clientMessageId
            ? { ...item, status: "sending", error: null, failedFiles: [] }
            : item,
        ),
      };
    case "discard":
      return {
        ...state,
        pending: state.pending.filter((item) => item.clientMessageId !== action.clientMessageId),
      };
    case "confirmed": {
      const messages = mergeMessages(state.messages, [action.message]);
      return {
        ...state,
        messages,
        pending: state.pending.filter((item) => item.clientMessageId !== action.clientMessageId),
      };
    }
    default:
      return state;
  }
}

export function newestMessageId(state) {
  return state.messages.length ? state.messages[state.messages.length - 1].id : null;
}

export function oldestMessageId(state) {
  return state.messages.length ? state.messages[0].id : null;
}

/** Messages in `next` that were not in `prev` and were not sent by me. */
export function countNewArrivals(prev, next, isMine) {
  const seen = new Set(prev.map((message) => message.id));
  return next.filter((message) => !seen.has(message.id) && !isMine(message)).length;
}

/** Index of the first message from the other side after my read cursor, or -1. */
export function findFirstUnreadIndex(messages, cursor, isMine) {
  return messages.findIndex(
    (message) => !isMine(message) && !isAtOrBefore(message, cursor),
  );
}

export function isSeen(message, cursor) {
  return isAtOrBefore(message, cursor);
}

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function dayKey(iso) {
  return DAY_KEY.format(new Date(iso));
}

export function dayLabel(iso, nowMs) {
  const key = dayKey(iso);
  if (key === dayKey(new Date(nowMs).toISOString())) return "Today";
  if (key === dayKey(new Date(nowMs - 86_400_000).toISOString())) return "Yesterday";
  return DAY_LABEL.format(new Date(iso));
}

const GROUP_GAP_MS = 5 * 60_000;

/**
 * Display items: date separators + messages flagged with their position in
 * a group. A group = same sender (same admin, for admin messages) within
 * five minutes on the same day. The sender label is shown once per group.
 */
export function buildDisplayItems(messages, { nowMs }) {
  const items = [];
  let previous = null;
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    if (!previous || dayKey(previous.createdAt) !== key) {
      items.push({ type: "date", key: `date-${key}`, label: dayLabel(message.createdAt, nowMs) });
      previous = null;
    }
    const sameSender =
      previous &&
      previous.senderRole === message.senderRole &&
      (previous.senderUserId ?? null) === (message.senderUserId ?? null) &&
      // Customer view: admins are told apart by public username only.
      (previous.senderName ?? null) === (message.senderName ?? null) &&
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_GAP_MS &&
      previous.kind !== "slip" && message.kind !== "slip";
    if (sameSender) {
      items[items.length - 1].lastInGroup = false;
    }
    items.push({
      type: "message",
      key: message.id,
      message,
      firstInGroup: !sameSender,
      lastInGroup: true,
    });
    previous = message;
  }
  return items;
}
