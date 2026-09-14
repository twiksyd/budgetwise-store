// Typed as .d.mts, not .mjs.d.ts: TypeScript only substitutes .d.mts for a
// ".mjs" import specifier, so this is the spelling that actually reaches the
// compiler — the same applies to order-access.d.mts and order-creation.d.mts.
import type { OrderConfirmation } from "@/lib/queries/orders";

export interface ResolvedOrderLine {
  userId: string;
  gamepassId: string;
  gameId: string;
  productName: string;
  gameName: string;
  unitRobuxAmount: number;
  unitPrice: number;
  unitCost: number;
  quantity: number;
  isViaPlus: boolean;
}

/** Line payload persisted by the create_store_order RPC. */
export interface OrderSnapshotLine {
  user_id: string;
  gamepass_id: string;
  game_id: string;
  product_name: string;
  game_name: string;
  robux_amount: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_via_plus: boolean;
  line_robux_amount: number;
  line_cost: number;
  line_profit: number;
}

export interface OrderSnapshotHeaderRow {
  order_number: string;
  buyer_name: string;
  buyer_roblox_username: string;
  total_amount: number;
  created_at: string;
}

export interface OrderSnapshotLineRow {
  line_index: number;
  gamepass_id: string | null;
  game_id: string | null;
  product_name: string;
  game_name: string;
  robux_amount: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_via_plus: boolean;
}

export interface OrderSnapshotViaPlusRow {
  roblox_display_name: string;
  age_16_confirmed: boolean;
  verified_account_confirmed: boolean;
  via_plus_robux_amount: number;
}

export function buildOrderSnapshotLines(
  items: ResolvedOrderLine[],
): OrderSnapshotLine[];

export function sumSnapshotLineTotals(
  lines: Pick<OrderSnapshotLine, "line_total">[],
): number;

export function buildOrderConfirmationFromSnapshot(input: {
  header: OrderSnapshotHeaderRow;
  lines: OrderSnapshotLineRow[];
  viaPlusDetails?: OrderSnapshotViaPlusRow | null;
  status?: string;
}): OrderConfirmation;
