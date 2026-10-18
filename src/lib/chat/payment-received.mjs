// "Payment Received" (0027) rules shared by the admin and customer chats.
// The database is the authority; these only decide what to show and which
// message to re-read.

/** The order's latest payment card on screen (messages are in server order). */
function latestPayment(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].kind === "payment") return messages[index];
  }
  return null;
}

/**
 * The one card an admin may confirm: the latest payment card, while it is
 * unconfirmed. `requestId` is the server's latest card (inbox row); when it
 * is known and is not the latest one loaded, nothing is confirmable yet —
 * an older card is never offered by mistake.
 */
export function confirmablePaymentId(messages, requestId) {
  const latest = latestPayment(messages ?? []);
  if (!latest || latest.paymentReceived) return null;
  if (requestId && requestId !== latest.id) return null;
  return latest.id;
}

/**
 * The server says `confirmedId` was confirmed; if that card is on screen
 * still unconfirmed (missed or not-yet-applied event), it must be re-read.
 */
export function paymentMessageToRefresh(messages, confirmedId) {
  if (!confirmedId) return null;
  const message = (messages ?? []).find((item) => item.id === confirmedId);
  return message && message.kind === "payment" && !message.paymentReceived ? message.id : null;
}

/** True while the latest payment card on screen has been confirmed. */
export function latestPaymentReceived(messages) {
  return Boolean(latestPayment(messages ?? [])?.paymentReceived);
}

// ---- 0033: one customer conversation, several orders (and quotes).
// Every card belongs to a subject: its order (orderRef) or, for a General
// Inquiry quote, none. "Latest card only" applies per subject, so order A
// and order B are confirmed independently and never mixed up.

const subjectOf = (message) => message.orderRef ?? message.payment?.orderNumber ?? "";

/**
 * The cards an admin may confirm: the latest card of each subject, while
 * unconfirmed. When the server's awaited card (requestId) is known but not
 * loaded yet, nothing is offered until the thread catches up.
 */
export function confirmablePaymentIds(messages, requestId) {
  const list = messages ?? [];
  const latestBySubject = new Map();
  for (const message of list) {
    if (message.kind === "payment") latestBySubject.set(subjectOf(message), message);
  }
  const ids = new Set();
  if (requestId && !list.some((message) => message.id === requestId)) return ids;
  for (const message of latestBySubject.values()) {
    if (!message.paymentReceived) ids.add(message.id);
  }
  return ids;
}

/**
 * Server side: each order's payment state from its cards in the
 * conversation (newest first or in any order) and the confirmed card ids.
 *   awaiting  no card yet   sent  latest card unconfirmed   received  latest confirmed
 */
export function paymentStateByOrder(cards, confirmedIds) {
  const latest = new Map();
  for (const card of cards ?? []) {
    if (!card.order_ref) continue;
    const current = latest.get(card.order_ref);
    if (!current || current.created_at < card.created_at || (current.created_at === card.created_at && current.id < card.id)) {
      latest.set(card.order_ref, card);
    }
  }
  const states = new Map();
  for (const [order, card] of latest) states.set(order, confirmedIds?.has(card.id) ? "received" : "sent");
  return states;
}
