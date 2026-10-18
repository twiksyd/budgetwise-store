import type { FulfillmentRowLike, FulfillmentSlotView } from "./fulfillment-fields.mjs";

export interface OrderDetailsLine {
  lineIndex: number;
  gameId: string | null;
  gameName: string;
  productName: string;
  quantity: number;
  robuxAmount: number;
  totalRobux: number;
  unitPrice: number;
  lineTotal: number;
  isViaPlus: boolean;
  imageUrl: string | null;
  fulfillment: FulfillmentSlotView[];
}
export interface OrderDetails {
  /** "inquiry": a General Inquiry (0026) — the customer only, no items, total or payment. */
  kind?: "order" | "inquiry";
  order: {
    orderNumber: string;
    createdAt: string;
    status: string;
    total: number;
    conversationId: string | null;
    assignedAdminId: string | null;
    paymentDetailsSentAt: string | null;
    state: "active" | "done";
    doneAt: string | null;
  };
  customer: { name: string; robloxUsername: string; email: string | null };
  viaPlus: {
    robloxDisplayName: string;
    age16Confirmed: boolean;
    verifiedAccountConfirmed: boolean;
    robuxAmount: number;
  } | null;
  groups: { gameName: string; lines: OrderDetailsLine[] }[];
  fulfillmentPending: number;
}
export function buildOrderDetails(input: {
  snapshot: {
    order_number: string;
    buyer_name: string;
    buyer_roblox_username: string;
    total_amount: number | string;
    created_at: string;
  };
  lines: {
    line_index: number;
    gamepass_id?: string | null;
    game_id: string | null;
    game_name: string;
    product_name: string;
    quantity: number;
    robux_amount: number;
    unit_price: number | string;
    line_total: number | string;
    is_via_plus: boolean;
  }[];
  viaPlus: {
    roblox_display_name: string;
    age_16_confirmed: boolean;
    verified_account_confirmed: boolean;
    via_plus_robux_amount: number;
  } | null;
  fulfillmentRows: FulfillmentRowLike[];
  status: string | null;
  conversation: {
    id: string;
    assigned_admin_id: string | null;
    payment_details_sent_at: string | null;
    state?: "active" | "done";
    done_at?: string | null;
  } | null;
  customerEmail: string | null;
  /** gamepass id -> catalog artwork URL */
  artwork?: Map<string, string>;
}): OrderDetails;
