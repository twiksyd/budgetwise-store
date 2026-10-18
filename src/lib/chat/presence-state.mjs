// Who is viewing / typing in which conversation, built ONLY from
// server-published signal events. Each event carries the admin's user id
// (taken by the server from the session); names come from the trusted
// admin directory the page loaded, never from the event.

export const VIEWING_TTL_MS = 45_000;
export const TYPING_TTL_MS = 6_000;

export const emptyPresence = Object.freeze({});

// 0032: the CUSTOMER typing in a conversation. Server-published with no
// user id (the order number is the key); never mixed with admin entries.
const CUSTOMER_PREFIX = "customer:";

export function applySignal(state, event, nowMs) {
  if (event?.type === "customer_typing" || event?.type === "customer_stopped") {
    if (typeof event.order_number !== "string") return state;
    const key = CUSTOMER_PREFIX + event.order_number;
    const next = { ...state };
    if (event.type === "customer_stopped") {
      if (!state[key]) return state;
      delete next[key];
      return next;
    }
    next[key] = { orderNumber: event.order_number, customer: true, viewingUntil: nowMs + TYPING_TTL_MS, typingUntil: nowMs + TYPING_TTL_MS };
    return next;
  }
  const id = event?.admin_user_id;
  if (typeof id !== "string" || typeof event.order_number !== "string") return state;
  const current = state[id];
  const next = { ...state };

  switch (event.type) {
    case "viewing":
      next[id] = {
        orderNumber: event.order_number,
        viewingUntil: nowMs + VIEWING_TTL_MS,
        typingUntil:
          current?.orderNumber === event.order_number ? current.typingUntil : 0,
      };
      return next;
    case "typing":
      next[id] = {
        orderNumber: event.order_number,
        viewingUntil: nowMs + VIEWING_TTL_MS,
        typingUntil: nowMs + TYPING_TTL_MS,
      };
      return next;
    case "stopped":
      if (!current || current.orderNumber !== event.order_number) return state;
      next[id] = { ...current, typingUntil: 0 };
      return next;
    case "left":
      if (!current || current.orderNumber !== event.order_number) return state;
      delete next[id];
      return next;
    default:
      return state;
  }
}

/** Drops expired entries; returns the same object when nothing changed. */
export function prunePresence(state, nowMs) {
  let changed = false;
  const next = {};
  for (const [id, entry] of Object.entries(state)) {
    if (entry.viewingUntil > nowMs) {
      if (entry.typingUntil && entry.typingUntil <= nowMs) {
        next[id] = { ...entry, typingUntil: 0 };
        changed = true;
      } else {
        next[id] = entry;
      }
    } else {
      changed = true;
    }
  }
  return changed ? next : state;
}

function nameFor(id, directory) {
  // Public username first (Twicks / Zuno / Akio), like the rest of the inbox.
  return directory?.[id]?.publicUsername || directory?.[id]?.displayName || "Another admin";
}

function joinNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Other admins in one conversation, excluding me. */
export function describeConversationPresence(state, orderNumber, { me, directory, nowMs }) {
  const viewers = [];
  const typers = [];
  let customerTyping = false;
  for (const [id, entry] of Object.entries(state)) {
    if (entry.orderNumber !== orderNumber || entry.viewingUntil <= nowMs) continue;
    if (entry.customer) {
      if (entry.typingUntil > nowMs) customerTyping = true;
      continue;
    }
    if (id === me) continue;
    if (entry.typingUntil > nowMs) typers.push(nameFor(id, directory));
    else viewers.push(nameFor(id, directory));
  }
  typers.sort();
  viewers.sort();
  const parts = [];
  if (customerTyping) parts.push("Customer is typing");
  if (typers.length) parts.push(`${joinNames(typers)} ${typers.length === 1 ? "is" : "are"} typing`);
  if (viewers.length) parts.push(`${joinNames(viewers)} ${viewers.length === 1 ? "is" : "are"} viewing`);
  return { viewers, typers, customerTyping, text: parts.join(" · ") };
}
