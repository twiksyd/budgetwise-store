// Authorization cores for the file-serving and fulfillment routes. The
// Next.js route handlers only wire in real dependencies; every decision is
// made here, which is what the tests exercise.
import { isUuid, isValidOrderNumber } from "../order-chat.mjs";
import { validateFulfillmentSubmission } from "./fulfillment-fields.mjs";

// Payment QR files are only ever written under this generated shape
// (also enforced by a database check constraint).
export const PAYMENT_QR_PATH_RE =
  /^qr\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

const NOT_FOUND = { status: 404, body: { error: "Not found." } };

/**
 * GET /api/order-chat/<order>/payment-qr/<messageId>
 *
 * The storage path is resolved server-side from the stored payment message;
 * the request can only name an order and a message id, never a path.
 *   deps.resolveViewer(orderNumber) -> { ok: true } | { ok: false, status }
 *     (order owner OR admin; anything else is refused)
 *   deps.loadMessage(orderNumber, messageId) -> message row in THAT order | null
 *   deps.signQr(path) -> short-lived signed URL
 */
export async function handlePaymentQr({ orderNumber, messageId, deps }) {
  if (!isValidOrderNumber(orderNumber) || !isUuid(messageId)) return NOT_FOUND;

  const viewer = await deps.resolveViewer(orderNumber);
  if (!viewer.ok) return viewer.status === 401 ? { status: 401, body: { error: "Please sign in." } } : NOT_FOUND;

  const message = await deps.loadMessage(orderNumber, messageId);
  if (!message || message.order_number !== orderNumber || message.kind !== "payment") {
    return NOT_FOUND;
  }

  const path = message.payload?.qr_path;
  if (typeof path !== "string" || !PAYMENT_QR_PATH_RE.test(path)) return NOT_FOUND;

  return { status: 302, location: await deps.signQr(path) };
}

/**
 * GET /api/order-chat/attachments/<messageId>
 *   deps.loadMessage(messageId) -> row | null
 *   deps.resolveViewer(orderNumber) -> as above
 *   deps.signAttachment(path) -> signed URL
 */
export async function handleAttachment({ messageId, deps }) {
  if (!isUuid(messageId)) return NOT_FOUND;
  const message = await deps.loadMessage(messageId);
  if (!message?.attachment_path) return NOT_FOUND;

  const viewer = await deps.resolveViewer(message.order_number);
  if (!viewer.ok) return viewer.status === 401 ? { status: 401, body: { error: "Please sign in." } } : NOT_FOUND;

  return { status: 302, location: await deps.signAttachment(message.attachment_path) };
}

/**
 * GET /api/order-chat/media/<attachmentId>?size=thumb|full
 * One image of an album. The path comes from the attachment row, never the
 * request; the viewer must own the order or be an admin, re-checked on
 * every view. Thumbnails are what chat tiles load; full images only load
 * in the viewer.
 *   deps.loadAttachment(id) -> { order_number, storage_path, thumb_path } | null
 *   deps.resolveViewer(orderNumber) -> { ok: true } | { ok: false, status }
 *   deps.sign(path) -> short-lived signed URL
 */
export async function handleAlbumMedia({ attachmentId, size, deps }) {
  if (!isUuid(attachmentId)) return NOT_FOUND;
  const attachment = await deps.loadAttachment(attachmentId);
  if (!attachment) return NOT_FOUND;

  const viewer = await deps.resolveViewer(attachment.order_number);
  if (!viewer.ok) return viewer.status === 401 ? { status: 401, body: { error: "Please sign in." } } : NOT_FOUND;

  const path = size === "full" ? attachment.storage_path : attachment.thumb_path;
  if (typeof path !== "string" || !path.startsWith(`${attachment.order_number}/`)) return NOT_FOUND;
  return { status: 302, location: await deps.sign(path) };
}

/**
 * PUT fulfillment detail, customer (own order) or admin (correction).
 *   deps.resolveActor(orderNumber) -> { ok: true, userId } | { ok: false, status }
 *   deps.loadLines(orderNumber) -> [{ lineIndex, gameId, quantity }]
 *   deps.save({ ...validated, actorId }) -> saved row
 */
export async function handleFulfillmentSave({ orderNumber, body, deps }) {
  if (!isValidOrderNumber(orderNumber)) return NOT_FOUND;

  const actor = await deps.resolveActor(orderNumber);
  if (!actor.ok) {
    return actor.status === 401
      ? { status: 401, body: { error: "Please sign in." } }
      : actor.status === 403
        ? { status: 403, body: { error: "Not allowed." } }
        : NOT_FOUND;
  }

  const lines = await deps.loadLines(orderNumber);
  const input = body && typeof body === "object"
    ? {
        lineIndex: body.lineIndex,
        unitIndex: body.unitIndex,
        fieldKey: body.fieldKey,
        value: body.value,
      }
    : null;
  const validated = validateFulfillmentSubmission(lines, input);
  if (!validated.ok) return { status: 400, body: { error: validated.error } };

  const saved = await deps.save({ ...validated, actorId: actor.userId });
  return {
    status: 200,
    body: {
      detail: {
        lineIndex: validated.lineIndex,
        unitIndex: validated.unitIndex,
        fieldKey: validated.fieldKey,
        value: saved?.value ?? validated.value,
        externalId: saved?.external_id ?? validated.externalId,
        source: saved?.source ?? null,
        updatedAt: saved?.updated_at ?? null,
      },
    },
  };
}
