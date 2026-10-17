// Pure rules for the on-site order chat. Shared by the API routes (which
// enforce them) and the chat UI (which mirrors them for friendly errors), and
// plain .mjs so scripts/test-order-chat.mjs can exercise the real thing.

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
// A burst limit per order and sender, so a stuck client or a bad actor cannot
// flood an order's thread. Counted from the database, not from memory, so it
// holds across serverless instances.
export const MESSAGE_RATE_LIMIT = { count: 20, windowSeconds: 60 };

export const ALLOWED_ATTACHMENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CONTROL_CHARACTER_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const ORDER_NUMBER_RE = /^[A-Za-z0-9-]{1,40}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidOrderNumber(value) {
  return typeof value === "string" && ORDER_NUMBER_RE.test(value);
}

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Normalises and validates a message body.
 * Returns { ok: true, body } or { ok: false, error }.
 * An empty body is fine only when `allowEmpty` (an image with no caption).
 */
export function validateMessageBody(input, { allowEmpty = false } = {}) {
  if (input !== undefined && input !== null && typeof input !== "string") {
    return { ok: false, error: "Invalid message." };
  }

  const body = (input ?? "").replace(/\r\n?/g, "\n").trim();

  if (body.length === 0) {
    return allowEmpty
      ? { ok: true, body: "" }
      : { ok: false, error: "Type a message first." };
  }

  if (body.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  if (CONTROL_CHARACTER_RE.test(body)) {
    return { ok: false, error: "That message has unsupported characters." };
  }

  return { ok: true, body };
}

/**
 * Validates an attachment's declared type and size. The declared type is only
 * a first filter — callers must also check the real bytes with
 * sniffImageType before storing anything.
 */
export function validateAttachmentMeta({ type, size }) {
  if (!Object.hasOwn(ALLOWED_ATTACHMENT_TYPES, type)) {
    return { ok: false, error: "Only JPG, PNG, or WebP images can be sent." };
  }

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "That image looks empty." };
  }

  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "That image is too large (4 MB max)." };
  }

  return { ok: true, extension: ALLOWED_ATTACHMENT_TYPES[type] };
}

/**
 * Identifies an image by its magic bytes, so a file merely *named* .png (or
 * sent with a forged Content-Type) is never stored as one.
 * Returns "image/jpeg" | "image/png" | "image/webp" | null.
 */
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }

  const ascii = (start, end) =>
    String.fromCharCode(...Array.from(bytes.slice(start, end)));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }

  return null;
}

/** Storage object path: one folder per order, an unguessable file name. */
export function buildAttachmentPath({ orderNumber, messageId, extension }) {
  return `${orderNumber}/${messageId}.${extension}`;
}

/**
 * Only same-site relative paths may be used as a post-login destination, so
 * /login?next=//evil.example or /login?next=https://evil.example can never
 * bounce a freshly signed-in customer to another site.
 */
export function sanitizeNextPath(value, fallback = "/account/orders") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\x00-\x1f\x7f\\]/.test(value)) return fallback;
  return value;
}

/** Short single-line preview for inbox rows. */
export function previewMessage(message, maxLength = 80) {
  if (!message) return "";
  if (message.kind === "image") {
    return message.body ? `📷 ${message.body}` : "📷 Photo";
  }
  if (message.kind === "slip") return "Order slip";

  const flat = String(message.body ?? "").replace(/\s+/g, " ").trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}
