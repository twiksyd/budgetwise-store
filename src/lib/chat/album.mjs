// Image albums: one message, up to 10 images. Pure rules shared by the
// server routes (validation) and the chat UI (gallery layout).
import { isUuid, MAX_ATTACHMENT_BYTES, MAX_MESSAGE_LENGTH } from "../order-chat.mjs";

export const ALBUM_MAX_IMAGES = 10;
// Thumbnails are made in the browser (about 480 px). Kept small so a full
// image (4 MB) + thumbnail + form framing stays under Vercel's 4.5 MB
// request limit.
export const THUMB_MAX_BYTES = 256 * 1024;
export const ALBUM_LABELS = Object.freeze(["proof_of_delivery"]);
export const ALBUM_LABEL_TEXT = Object.freeze({ proof_of_delivery: "Proof of delivery" });
/** Simultaneous uploads from one browser. */
export const UPLOAD_CONCURRENCY = 2;

function dimension(value) {
  return Number.isInteger(value) && value >= 1 && value <= 20000 ? value : null;
}

/** Upload form fields: position 0..9 and a client message id. */
export function parseUploadFields({ position, clientMessageId }) {
  const index = Number(position);
  if (!Number.isInteger(index) || index < 0 || index >= ALBUM_MAX_IMAGES || String(index) !== String(position)) {
    return { ok: false, error: "Invalid image position." };
  }
  if (!isUuid(clientMessageId)) return { ok: false, error: "Invalid request." };
  return { ok: true, position: index, clientMessageId };
}

/**
 * The album message request (JSON):
 *   { kind: "album", clientMessageId, body?, label?, items: [{ position, width?, height? }] }
 * Labels are BudgetWise's (admins) only.
 */
export function parseAlbumRequest(input, { role }) {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  if (!isUuid(input.clientMessageId)) return { ok: false, error: "Invalid request." };
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "That caption is too long." };

  let label = null;
  if (input.label !== undefined && input.label !== null && input.label !== "") {
    if (!ALBUM_LABELS.includes(input.label)) return { ok: false, error: "Unknown album label." };
    if (role !== "admin") return { ok: false, error: "Not allowed.", status: 403 };
    label = input.label;
  }

  const items = Array.isArray(input.items) ? input.items : null;
  if (!items || items.length < 1 || items.length > ALBUM_MAX_IMAGES) {
    return { ok: false, error: `Send 1 to ${ALBUM_MAX_IMAGES} images at a time.` };
  }
  const parsed = [];
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object" || item.position !== index) {
      return { ok: false, error: "Invalid image list." };
    }
    parsed.push({ position: index, width: dimension(item.width), height: dimension(item.height) });
  }
  return { ok: true, clientMessageId: input.clientMessageId, body, label, items: parsed };
}

/**
 * Matches the requested items against what was actually uploaded (and
 * validated) for this album. Paths come from the server's own listing,
 * never from the request. Reports exactly which images are missing.
 */
export function buildAlbumAttachments(items, uploads) {
  const missing = [];
  const attachments = [];
  for (const item of items) {
    const upload = uploads.get(item.position);
    if (
      !upload?.path ||
      !upload.thumbPath ||
      !(upload.size > 0) ||
      upload.size > MAX_ATTACHMENT_BYTES
    ) {
      missing.push(item.position);
      continue;
    }
    attachments.push({
      position: item.position,
      path: upload.path,
      mime: upload.mime,
      size: upload.size,
      thumb_path: upload.thumbPath,
      thumb_mime: upload.thumbMime,
      width: item.width,
      height: item.height,
    });
  }
  return missing.length
    ? { ok: false, missing, error: `Image ${missing.map((p) => p + 1).join(", ")} did not finish uploading.` }
    : { ok: true, attachments };
}

/**
 * Gallery layout for n images:
 *   1: one tile (natural aspect)   2: two side by side
 *   3: one large + two small       4: 2x2
 *   5+: 2x2 where the 4th tile shows "+N"
 */
export function albumLayout(count) {
  if (count <= 0) return { shown: 0, overflow: 0, pattern: "none" };
  if (count === 1) return { shown: 1, overflow: 0, pattern: "single" };
  if (count === 2) return { shown: 2, overflow: 0, pattern: "pair" };
  if (count === 3) return { shown: 3, overflow: 0, pattern: "feature" };
  return { shown: 4, overflow: count - 4, pattern: "grid" };
}

/** Customer-facing album title: "Proof of delivery", "8 screenshots"... */
export function albumCaption(album) {
  const count = album?.items?.length ?? 0;
  return {
    title: album?.label ? ALBUM_LABEL_TEXT[album.label] : null,
    countText: count > 1 ? `${count} ${album?.label ? "screenshots" : "photos"}` : null,
  };
}
