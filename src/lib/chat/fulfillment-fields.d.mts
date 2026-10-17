export interface FulfillmentLine {
  lineIndex: number;
  gameId: string | null;
  quantity: number;
}
export interface FulfillmentField {
  key: string;
  label: string;
  cardinality: "per_unit" | "per_line";
  appliesToLine(line: FulfillmentLine): boolean;
  parse(input: unknown):
    | { ok: true; value: string; externalId: string }
    | { ok: false; error: string };
}
export const FULFILLMENT_FIELDS: Readonly<Record<string, FulfillmentField>>;
export function getFulfillmentField(fieldKey: unknown): FulfillmentField | null;
export interface FulfillmentSlot {
  lineIndex: number;
  unitIndex: number;
  unitCount: number;
  fieldKey: string;
  label: string;
}
export function fulfillmentSlotsForLines(lines: FulfillmentLine[]): FulfillmentSlot[];
export function isKnownSlot(
  lines: FulfillmentLine[],
  slot: { lineIndex: number; unitIndex: number; fieldKey: string },
): boolean;
export interface FulfillmentRowLike {
  line_index: number | null;
  unit_index: number;
  field_key: string;
  value: string;
  external_id: string | null;
  source: "customer" | "admin";
  updated_at: string;
}
export interface FulfillmentSlotView extends FulfillmentSlot {
  status: "provided" | "waiting";
  value: string | null;
  externalId: string | null;
  source: "customer" | "admin" | null;
  updatedAt: string | null;
}
export function buildFulfillmentView(
  lines: FulfillmentLine[],
  rows: FulfillmentRowLike[] | null | undefined,
): FulfillmentSlotView[];
export function validateFulfillmentSubmission(
  lines: FulfillmentLine[],
  input: unknown,
):
  | {
      ok: true;
      lineIndex: number;
      unitIndex: number;
      fieldKey: string;
      value: string;
      externalId: string;
    }
  | { ok: false; error: string };
