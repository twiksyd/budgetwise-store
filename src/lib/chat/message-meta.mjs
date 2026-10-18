// Phase 3 (0032): reactions and replies — shared by server and browser.
//
// Reactions are stored as short keys (love, haha, sad, wow, like) and shown
// as standard Unicode emoji. Quotes of the original message are a SAFE
// SUMMARY computed on the server: text is cut short, media and payment
// cards become "Photo", "3 photos", "Payment details", "Order placed" — no
// storage paths, amounts or account numbers ever ride along in a quote.

export const REACTIONS = Object.freeze([
  Object.freeze({ key: "love", emoji: "❤️", label: "Love" }),
  Object.freeze({ key: "haha", emoji: "😂", label: "Haha" }),
  Object.freeze({ key: "sad", emoji: "😢", label: "Sad" }),
  Object.freeze({ key: "wow", emoji: "😮", label: "Wow" }),
  Object.freeze({ key: "like", emoji: "👍", label: "Like" }),
]);
const REACTION_KEYS = new Set(REACTIONS.map((reaction) => reaction.key));

export function isReactionKey(value) {
  return typeof value === "string" && REACTION_KEYS.has(value);
}

export function reactionEmoji(key) {
  return REACTIONS.find((reaction) => reaction.key === key)?.emoji ?? "";
}

/** Only known keys with positive whole counts, in the fixed display order. */
export function cleanCounts(counts) {
  const out = {};
  if (!counts || typeof counts !== "object") return out;
  for (const { key } of REACTIONS) {
    const n = Number(counts[key]);
    if (Number.isInteger(n) && n > 0) out[key] = n;
  }
  return out;
}

/**
 * Reaction rows -> per-message summary for one viewer:
 *   { counts: {love: 2}, mine: "love" | null }
 * Messages without reactions are simply absent.
 */
export function summarizeReactions(rows, viewerUserId) {
  const byMessage = new Map();
  for (const row of rows ?? []) {
    if (!isReactionKey(row.reaction)) continue;
    const entry = byMessage.get(row.message_id) ?? { counts: {}, mine: null };
    entry.counts[row.reaction] = (entry.counts[row.reaction] ?? 0) + 1;
    if (row.actor_user_id === viewerUserId) entry.mine = row.reaction;
    byMessage.set(row.message_id, entry);
  }
  return byMessage;
}

/** A live 'reaction' event -> the viewer's summary (null when none left). */
export function reactionsFromEvent(payload, { viewer, me }) {
  const counts = cleanCounts(payload?.counts);
  if (Object.keys(counts).length === 0) return null;
  const mine =
    viewer === "customer"
      ? (isReactionKey(payload?.customer) ? payload.customer : null)
      : (isReactionKey(payload?.admins?.[me]) ? payload.admins[me] : null);
  return { counts, mine };
}

/** Optimistic local change: my reaction moves from `previous` to `next`. */
export function applyMyReaction(current, next) {
  const counts = { ...(current?.counts ?? {}) };
  const previous = current?.mine ?? null;
  if (previous) counts[previous] = Math.max(0, (counts[previous] ?? 0) - 1);
  if (next) counts[next] = (counts[next] ?? 0) + 1;
  const cleaned = cleanCounts(counts);
  return Object.keys(cleaned).length ? { counts: cleaned, mine: next } : null;
}

const QUOTE_TEXT_MAX = 120;

/** Safe one-line summary of a message for a quote. */
export function quotePreview(row, { albumCount } = {}) {
  switch (row?.kind) {
    case "text": {
      const text = String(row.body ?? "").replace(/\s+/g, " ").trim();
      return text.length > QUOTE_TEXT_MAX ? `${text.slice(0, QUOTE_TEXT_MAX - 1)}…` : text || "Message";
    }
    case "image":
      return "Photo";
    case "album": {
      const proof = row.payload && typeof row.payload === "object" && row.payload.label === "proof_of_delivery";
      const count = Number.isInteger(albumCount) && albumCount > 0 ? albumCount : null;
      const photos = count === null ? "Photos" : count === 1 ? "Photo" : `${count} photos`;
      return proof ? `Proof of delivery · ${photos}` : photos;
    }
    case "payment":
      return "Payment details";
    case "slip":
      return "Order placed";
    default:
      return "Message";
  }
}

/** The same safe summary, from a message the browser already has. */
export function quotePreviewFromDto(message) {
  if (!message) return "Message";
  return quotePreview(
    { kind: message.kind, body: message.body, payload: message.album?.label ? { label: message.album.label } : null },
    { albumCount: message.album?.items?.length },
  );
}
