// Exact message ordering, matching the database's (created_at, id) order.
// Timestamps carry microseconds, which Date cannot hold, so they are
// compared as integer microseconds.

export function toMicros(iso) {
  if (typeof iso !== "string") return Number.NaN;
  const match = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(iso);
  if (!match) return Number.NaN;
  const [, base, fraction = "", zone] = match;
  const offset = zone === "Z" ? "Z" : zone.length === 3 ? `${zone}:00` : zone.includes(":") ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const seconds = Date.parse(`${base.replace(" ", "T")}${offset}`);
  if (Number.isNaN(seconds)) return Number.NaN;
  const micros = Number((fraction + "000000").slice(0, 6));
  return seconds * 1000 + micros;
}

/** -1 / 0 / 1 for two {createdAt, id} positions. */
export function comparePositions(a, b) {
  const at = toMicros(a.createdAt);
  const bt = toMicros(b.createdAt);
  if (at !== bt) return at < bt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** True when `message` is at or before `cursor` ({at, messageId}). */
export function isAtOrBefore(message, cursor) {
  if (!cursor || !cursor.at || !cursor.messageId) return false;
  return (
    comparePositions(message, { createdAt: cursor.at, id: cursor.messageId }) <= 0
  );
}
