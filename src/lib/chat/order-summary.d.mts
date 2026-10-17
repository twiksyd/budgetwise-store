export interface OrderLineSnapshotLike {
  line_index: number;
  gamepass_id?: string | null;
  product_name: string;
  game_name: string;
  quantity: number | string;
  robux_amount?: number | string | null;
  unit_price: number | string;
  line_total: number | string;
}
export interface SummaryLine {
  lineIndex: number;
  productName: string;
  gameName: string;
  quantity: number;
  robuxAmount: number | null;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
}
export function summarizeLines(lines: OrderLineSnapshotLike[], artwork?: Map<string, string>): SummaryLine[];
export function describeOrderItems(lines: Array<{ quantity: number | string; gameName?: string; game_name?: string }>): string;
export function customerStateLabel(state: "active" | "done" | null | undefined): "Completed" | "In progress";
export interface ConversationPick {
  orderNumber: string;
  state: "active" | "done";
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt?: string | null;
}
export function orderOpenSection<T extends { unreadCount: number; lastMessageAt: string | null; createdAt: string }>(
  rows: T[],
): { unread: T[]; active: T[] };
export function pickConversation<T extends ConversationPick>(conversations: T[]): T | null;
export function relevantConversations<T extends ConversationPick>(conversations: T[]): T[];
export function badgeText(count: number): string | null;
