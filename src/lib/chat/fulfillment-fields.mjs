// Whitelisted, structured fulfillment fields. Adding a future field means
// adding an entry here (and, if the database should enforce its shape, a
// check constraint) — no new tables or APIs.
//
// Today there is exactly one: the customer's own gamepass link for
// Robux (Via Link) lines. Nothing else is collected; nothing is invented.
import { isRobuxViaLinkGameId } from "../../config/robux-via-link-ids.mjs";
import { parseRobloxGamepassUrl } from "./gamepass-url.mjs";

export const FULFILLMENT_FIELDS = Object.freeze({
  roblox_gamepass_url: Object.freeze({
    key: "roblox_gamepass_url",
    label: "Gamepass Link",
    // The cart allows quantity > 1 for Via Link items and nothing in the
    // app says whether two units mean one gamepass or two, so each unit has
    // its own slot (confirmed by the store owner: one link per unit).
    cardinality: "per_unit",
    appliesToLine: (line) => isRobuxViaLinkGameId(line.gameId),
    parse(input) {
      const parsed = parseRobloxGamepassUrl(input);
      return parsed.ok
        ? { ok: true, value: parsed.canonicalUrl, externalId: parsed.gamepassId }
        : parsed;
    },
  }),
});

export function getFulfillmentField(fieldKey) {
  return Object.hasOwn(FULFILLMENT_FIELDS, fieldKey)
    ? FULFILLMENT_FIELDS[fieldKey]
    : null;
}

/** Every slot the order needs, in line/unit order. */
export function fulfillmentSlotsForLines(lines) {
  const slots = [];
  for (const line of lines) {
    for (const field of Object.values(FULFILLMENT_FIELDS)) {
      if (!field.appliesToLine(line)) continue;
      const units =
        field.cardinality === "per_unit" ? Math.max(1, line.quantity) : 1;
      for (let unitIndex = 0; unitIndex < units; unitIndex += 1) {
        slots.push({
          lineIndex: line.lineIndex,
          unitIndex,
          unitCount: units,
          fieldKey: field.key,
          label: field.label,
        });
      }
    }
  }
  return slots;
}

export function isKnownSlot(lines, { lineIndex, unitIndex, fieldKey }) {
  return fulfillmentSlotsForLines(lines).some(
    (slot) =>
      slot.lineIndex === lineIndex &&
      slot.unitIndex === unitIndex &&
      slot.fieldKey === fieldKey,
  );
}

/**
 * Joins the required slots with what has been stored. Values only ever come
 * from the structured rows passed in — never from chat.
 */
export function buildFulfillmentView(lines, rows) {
  const byKey = new Map(
    (rows ?? []).map((row) => [
      `${row.line_index}:${row.unit_index}:${row.field_key}`,
      row,
    ]),
  );
  return fulfillmentSlotsForLines(lines).map((slot) => {
    const row = byKey.get(`${slot.lineIndex}:${slot.unitIndex}:${slot.fieldKey}`);
    return {
      ...slot,
      status: row ? "provided" : "waiting",
      value: row?.value ?? null,
      externalId: row?.external_id ?? null,
      source: row?.source ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

/** Validates a submission against the order's actual slots and the field rules. */
export function validateFulfillmentSubmission(lines, input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid request." };
  }
  const { lineIndex, unitIndex, fieldKey, value } = input;
  const field = getFulfillmentField(fieldKey);
  if (!field) return { ok: false, error: "Unknown field." };
  if (!Number.isInteger(lineIndex) || !Number.isInteger(unitIndex)) {
    return { ok: false, error: "Invalid item." };
  }
  if (!isKnownSlot(lines, { lineIndex, unitIndex, fieldKey })) {
    return { ok: false, error: "This item does not need that information." };
  }
  const parsed = field.parse(value);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    lineIndex,
    unitIndex,
    fieldKey,
    value: parsed.value,
    externalId: parsed.externalId,
  };
}
