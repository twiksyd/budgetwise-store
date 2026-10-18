// Customer avatars in the ADMIN inbox (0029). Three levels:
//   1. the customer's Google profile photo, when Google provided one and it
//      is on Google's own photo host (allow-list below);
//   2. a deterministic geometric identicon from an opaque seed: the server
//      derives the seed with an HMAC of the customer's account id, so the
//      same customer gets the same design in every conversation and the
//      seed reveals nothing about the account;
//   3. initials, if neither can render.
// Customers never see these: their chat shows the BudgetWise logo.

const GOOGLE_PHOTO_HOST = /^lh[3-6]\.googleusercontent\.com$/;
const MAX_URL_LENGTH = 2048;

/** The Google photo URL, or null if it is anything but https on Google's photo host. */
export function safeGooglePhotoUrl(value) {
  if (typeof value !== "string" || !value || value.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!GOOGLE_PHOTO_HOST.test(url.hostname)) return null;
  return url.toString();
}

export const SEED_PATTERN = /^[0-9a-f]{16}$/;

// Distinct, accessible hues (foreground) with a light tint background.
const PALETTE = [
  ["#2563eb", "#dbeafe"],
  ["#7c3aed", "#ede9fe"],
  ["#db2777", "#fce7f3"],
  ["#dc2626", "#fee2e2"],
  ["#ea580c", "#ffedd5"],
  ["#ca8a04", "#fef9c3"],
  ["#16a34a", "#dcfce7"],
  ["#0d9488", "#ccfbf1"],
  ["#0891b2", "#cffafe"],
  ["#4f46e5", "#e0e7ff"],
  ["#9333ea", "#f3e8ff"],
  ["#475569", "#e2e8f0"],
];
export const SHAPES = Object.freeze(["square", "circle", "diamond", "triangle"]);

/**
 * A 5x5, left-right mirrored pattern plus a colour pair and a cell shape,
 * all from the seed. Same seed -> same design. Only numbers and colours
 * from the fixed palette leave this function: nothing a caller passes can
 * end up in the SVG as markup.
 */
export function identiconSpec(seed) {
  if (typeof seed !== "string" || !SEED_PATTERN.test(seed)) return null;
  const bits = BigInt(`0x${seed}`);
  const bit = (index) => ((bits >> BigInt(index)) & 1n) === 1n;
  const [fg, bg] = PALETTE[Number((bits >> 48n) % BigInt(PALETTE.length))];
  const shape = SHAPES[Number((bits >> 56n) & 3n)];
  const cells = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (!bit(y * 3 + x)) continue;
      cells.push([x, y]);
      if (x < 2) cells.push([4 - x, y]);
    }
  }
  // A near-empty pattern is hard to tell apart: fill the centre column.
  if (cells.length < 5) for (let y = 0; y < 5; y += 1) if (!cells.some(([cx, cy]) => cx === 2 && cy === y)) cells.push([2, y]);
  return { fg, bg, shape, cells };
}

/** Up to two initials from a display name; "?" when there is none. */
export function initialsOf(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}
