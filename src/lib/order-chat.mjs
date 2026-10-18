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

// A chat thread key is an order number, or a General Inquiry key
// ('GI-' + 8 hex, migration 0026). Order numbers never look like this.
const INQUIRY_KEY_RE = /^GI-[0-9A-F]{8}$/;

/** A customer's General Inquiry thread (not an order). */
export function isInquiryKey(value) {
  return typeof value === "string" && INQUIRY_KEY_RE.test(value);
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

const MAX_IMAGE_DIMENSION = 20000;

/**
 * Magic bytes AND the image's own structure: the header chunk a decoder
 * needs first (PNG IHDR, a JPEG frame header, a WebP VP8/VP8L/VP8X chunk),
 * real dimensions, and (PNG/WebP) a consistent length. A file that merely
 * starts like an image — a renamed program, a truncated upload, random
 * bytes behind a PNG signature — is refused.
 * Returns { type, width, height } | null.
 */
export function inspectImage(bytes) {
  const type = sniffImageType(bytes);
  if (!type) return null;
  const size = (width, height) =>
    width >= 1 && height >= 1 && width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION
      ? { type, width, height }
      : null;
  const u32be = (at) => ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
  const u32le = (at) => bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16) + ((bytes[at + 3] << 24) >>> 0);
  const ascii = (start, end) => String.fromCharCode(...Array.from(bytes.slice(start, end)));

  if (type === "image/png") {
    // IHDR first (13 bytes of data), IEND last.
    if (bytes.length < 8 + 25 + 12) return null;
    if (u32be(8) !== 13 || ascii(12, 16) !== "IHDR") return null;
    if (ascii(bytes.length - 8, bytes.length - 4) !== "IEND") return null;
    return size(u32be(16), u32be(20));
  }

  if (type === "image/webp") {
    // RIFF length must cover the file; first chunk names the codec.
    if (bytes.length < 30) return null;
    const riffEnd = u32le(4) + 8;
    if (riffEnd > bytes.length || riffEnd < 30) return null;
    const chunk = ascii(12, 16);
    if (chunk === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return size(width, height);
    }
    if (chunk === "VP8L") {
      if (bytes[20] !== 0x2f) return null;
      const bits = u32le(21);
      return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (chunk === "VP8 ") {
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
      return size((bytes[26] | (bytes[27] << 8)) & 0x3fff, (bytes[28] | (bytes[29] << 8)) & 0x3fff);
    }
    return null;
  }

  // JPEG: walk the segments to the first frame header (SOFn).
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // image data before any frame header
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2 || at + 2 + length > bytes.length) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (length < 8) return null;
      return size((bytes[at + 7] << 8) | bytes[at + 8], (bytes[at + 5] << 8) | bytes[at + 6]);
    }
    at += 2 + length;
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
  if (message.kind === "product") return "Product card";

  const flat = String(message.body ?? "").replace(/\s+/g, " ").trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}
