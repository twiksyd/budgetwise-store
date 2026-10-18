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
