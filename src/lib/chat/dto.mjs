import { quotePreview } from "./message-meta.mjs";
import { toProductCard } from "./recommendation.mjs";
import { toVouchRequest } from "./vouch-request.mjs";

// The only shapes chat data leaves the server in. Whitelists, never spreads:
// a new database column can never leak by accident.
//
// Internal-only fields that must never reach a customer:
//   attachment_path, attachment_mime, sender_user_id, payload.qr_path,
//   payload.method_id, read_at, album storage/thumb paths.

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
    // 0033: the order this card is for, in a customer conversation (null =
    // a General Inquiry quote, or an order's own older chat).
    orderNumber: typeof payload.order_number === "string" ? payload.order_number : null,
  };
}

const SLIP_PAYMENT_STATES = new Set(["awaiting", "sent", "received"]);

/**
 * 0033: a structured order slip from the order's own records (snapshot +
 * frozen lines + its payment cards), never parsed from chat text.
 */
export function toOrderSlip(order) {
  if (!order || typeof order.orderNumber !== "string") return null;
  return {
    orderNumber: order.orderNumber,
    createdAt: String(order.createdAt ?? ""),
    total: Number(order.total) || 0,
    status: String(order.status ?? "pending"),
    itemCount: Number(order.itemCount) || 0,
    items: (order.items ?? []).slice(0, 20).map((item) => ({
      productName: String(item.productName ?? ""),
      gameName: String(item.gameName ?? ""),
      quantity: Number(item.quantity) || 0,
      lineTotal: Number(item.lineTotal) || 0,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    })),
    payment: SLIP_PAYMENT_STATES.has(order.payment) ? order.payment : "awaiting",
    fromRecommendation: order.fromRecommendation === true,
  };
}

/**
 * A payment card's verification (0027): set only by an admin's explicit
 * confirmation, never by a receipt. Customers get the time alone; admins
 * also get which admin confirmed it.
 */
export function toPaymentReceived(confirmation, viewer) {
  if (!confirmation || typeof confirmation.confirmed_at !== "string") return null;
  const received = { confirmedAt: confirmation.confirmed_at };
  if (viewer === "admin") received.confirmedBy = confirmation.confirmed_by ?? null;
  return received;
}

const ALBUM_LABELS = new Set(["proof_of_delivery"]);

/**
 * An album as clients see it: opaque attachment ids in order plus display
 * dimensions. Storage paths never leave the server.
 */
export function toAlbum(payload, attachments) {
  const label = payload && typeof payload === "object" && ALBUM_LABELS.has(payload.label) ? payload.label : null;
  const items = [...(attachments ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      width: Number.isInteger(item.width) ? item.width : null,
      height: Number.isInteger(item.height) ? item.height : null,
    }));
  return { label, items };
}

/**
 * One message for one viewer.
 *   viewer = "admin"    -> includes sender_user_id (for "Sent by Robert")
 *   viewer = "customer" -> no admin identity except the admin's public
 *                          username (senderName, from publicNames); client id
 *                          only on the customer's own messages (for
 *                          optimistic reconcile)
 */
/**
 * The quoted original of a reply (0032): who and a safe summary only.
 * Customers see an admin as their public username (or BudgetWise), never
 * an id; admins get the sender's user id for their own directory.
 */
export function toReplyQuote(target, { viewer, publicNames, albumCounts } = {}) {
  if (!target) return null;
  const quote = {
    id: target.id,
    senderRole: target.sender_role,
    kind: target.kind,
    preview: quotePreview(target, { albumCount: albumCounts?.get(target.id) }),
  };
  if (viewer === "admin") quote.senderUserId = target.sender_user_id ?? null;
  else if (target.sender_role === "admin") quote.senderName = (target.sender_user_id && publicNames?.get(target.sender_user_id)) || null;
  return quote;
}

export function toChatMessage(
  row,
  {
    viewer,
    viewerUserId,
    attachments,
    publicNames,
    paymentConfirmations,
    reactions,
    replyTargets,
    albumCounts,
    slipOrders,
    productLive,
    productLinks,
  } = {},
) {
  const base = {
    // 0032: only present when there is something to show.
    reactions: reactions?.get(row.id) ?? null,
    replyTo: row.reply_to_message_id
      ? toReplyQuote(replyTargets?.get(row.reply_to_message_id), { viewer, publicNames, albumCounts })
      : null,
    id: row.id,
    orderNumber: row.order_number,
    senderRole: row.sender_role,
    kind: row.kind,
    body: row.body ?? "",
    hasAttachment: Boolean(row.attachment_path),
    createdAt: row.created_at,
    clientMessageId: null,
    payment: row.kind === "payment" ? toPaymentCard(row.payload) : null,
    paymentReceived: row.kind === "payment" ? toPaymentReceived(paymentConfirmations?.get(row.id), viewer) : null,
    album: row.kind === "album" ? toAlbum(row.payload, attachments?.get(row.id)) : null,
    // 0033: which order a slip / payment card belongs to (customer conversation).
    orderRef: row.order_ref ?? null,
    order: row.kind === "slip" && row.order_ref ? toOrderSlip(slipOrders?.get(row.order_ref)) : null,
    product:
      row.kind === "product" ? toProductCard(row.payload, productLive?.get(row.id) ?? {}, productLinks?.get(row.id) ?? null) : null,
    vouch: row.kind === "vouch" ? toVouchRequest() : null,
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
  if (row.sender_role === "admin") {
    base.senderName = (row.sender_user_id && publicNames?.get(row.sender_user_id)) || null;
  }
  return base;
}
