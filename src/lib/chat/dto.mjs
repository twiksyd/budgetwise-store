// The only shapes chat data leaves the server in. Whitelists, never spreads:
// a new database column can never leak by accident.
//
// Internal-only fields that must never reach a customer:
//   attachment_path, attachment_mime, sender_user_id, payload.qr_path,
//   payload.method_id, read_at.

const PAYMENT_PROVIDERS = new Set(["gcash"]);

/** Customer-safe payment card from a stored payment payload. */
export function toPaymentCard(payload) {
  if (!payload || typeof payload !== "object") return null;
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount)) return null;
  const provider = PAYMENT_PROVIDERS.has(payload.provider) ? payload.provider : null;
  if (!provider) return null;
  return {
    provider,
    label: String(payload.label ?? ""),
    accountName: String(payload.account_name ?? ""),
    accountNumber: String(payload.account_number ?? ""),
    amount,
    currency: "PHP",
    hasQr: payload.has_qr === true,
  };
}

/**
 * One message for one viewer.
 *   viewer = "admin"    -> includes sender_user_id (for "Sent by Robert")
 *   viewer = "customer" -> no admin identity; client id only on the
 *                          customer's own messages (for optimistic reconcile)
 */
export function toChatMessage(row, { viewer, viewerUserId } = {}) {
  const base = {
    id: row.id,
    orderNumber: row.order_number,
    senderRole: row.sender_role,
    kind: row.kind,
    body: row.body ?? "",
    hasAttachment: Boolean(row.attachment_path),
    createdAt: row.created_at,
    clientMessageId: null,
    payment: row.kind === "payment" ? toPaymentCard(row.payload) : null,
  };

  if (viewer === "admin") {
    return {
      ...base,
      senderUserId: row.sender_user_id ?? null,
      clientMessageId: row.client_message_id ?? null,
    };
  }

  if (row.sender_role === "customer" && row.sender_user_id && row.sender_user_id === viewerUserId) {
    base.clientMessageId = row.client_message_id ?? null;
  }
  return base;
}
