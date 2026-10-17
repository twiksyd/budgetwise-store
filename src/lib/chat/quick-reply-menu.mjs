// "/shortcut" suggestions in the admin composer.
//
// A shortcut token is "/" at the start of the text or right after
// whitespace, followed by shortcut characters up to the caret. Matching is
// case-insensitive (shortcuts are stored lowercase). Selecting inserts the
// reply text in place of the token; it never sends.

const TOKEN_CHAR_RE = /[a-z0-9_-]/i;

export function detectShortcutQuery(text, caret) {
  if (typeof text !== "string") return null;
  const end = Math.max(0, Math.min(caret ?? text.length, text.length));
  let start = end;
  while (start > 0 && TOKEN_CHAR_RE.test(text[start - 1])) start -= 1;
  if (start === 0 || text[start - 1] !== "/") return null;
  const slash = start - 1;
  if (slash > 0 && !/\s/.test(text[slash - 1])) return null;
  return { start: slash, end, query: text.slice(start, end).toLowerCase() };
}

export function filterQuickReplies(replies, query, limit = 8) {
  const q = (query ?? "").toLowerCase();
  const enabled = (replies ?? []).filter((reply) => reply.isEnabled);
  const scored = [];
  for (const reply of enabled) {
    const shortcut = reply.shortcut.toLowerCase();
    const title = reply.title.toLowerCase();
    let score = -1;
    if (q === "") score = 3;
    else if (shortcut === q) score = 0;
    else if (shortcut.startsWith(q)) score = 1;
    else if (shortcut.includes(q) || title.includes(q)) score = 2;
    if (score >= 0) scored.push({ reply, score });
  }
  scored.sort((a, b) => a.score - b.score || a.reply.shortcut.localeCompare(b.reply.shortcut));
  return scored.slice(0, limit).map((entry) => entry.reply);
}

export const closedMenu = Object.freeze({
  open: false, items: [], activeIndex: 0, range: null, dismissedStart: null,
});

/**
 * Pure menu state.
 *   { type: "input", text, caret, replies }
 *   { type: "key", key }   ArrowDown | ArrowUp | Escape   (Enter: see selectedReply)
 *   { type: "hover", index }
 *   { type: "close" }
 */
export function quickReplyMenuReducer(state, action) {
  switch (action.type) {
    case "input": {
      const token = detectShortcutQuery(action.text, action.caret);
      if (!token) return { ...closedMenu };
      if (state.dismissedStart === token.start) {
        return { ...closedMenu, dismissedStart: token.start };
      }
      const items = filterQuickReplies(action.replies, token.query);
      if (items.length === 0) return { ...closedMenu };
      const sameToken = state.open && state.range?.start === token.start;
      return {
        open: true,
        items,
        activeIndex: sameToken ? Math.min(state.activeIndex, items.length - 1) : 0,
        range: { start: token.start, end: token.end },
        dismissedStart: null,
      };
    }
    case "key": {
      if (!state.open) return state;
      if (action.key === "ArrowDown") {
        return { ...state, activeIndex: (state.activeIndex + 1) % state.items.length };
      }
      if (action.key === "ArrowUp") {
        return {
          ...state,
          activeIndex: (state.activeIndex - 1 + state.items.length) % state.items.length,
        };
      }
      if (action.key === "Escape") {
        return { ...closedMenu, dismissedStart: state.range?.start ?? null };
      }
      return state;
    }
    case "hover":
      return state.open && action.index >= 0 && action.index < state.items.length
        ? { ...state, activeIndex: action.index }
        : state;
    case "close":
      return { ...closedMenu };
    default:
      return state;
  }
}

export function selectedReply(state) {
  return state.open ? state.items[state.activeIndex] ?? null : null;
}

/** Replaces the "/token" with the reply text. Returns the new text and caret. */
export function applyQuickReply(text, range, replyText) {
  const before = text.slice(0, range.start);
  const after = text.slice(range.end);
  const next = `${before}${replyText}${after}`;
  return { text: next, caret: before.length + replyText.length };
}
