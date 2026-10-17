export type InboxFilter = "all" | "unread" | "unassigned" | "mine" | "under_review";
export const INBOX_FILTERS: readonly InboxFilter[];
export interface InboxRow {
  conversationId: string;
  orderNumber: string;
  buyerName: string;
  buyerRobloxUsername: string;
  totalAmount: number;
  orderCreatedAt: string;
  orderStatus: string | null;
  assignedAdminId: string | null;
  assignedAt: string | null;
  lastMessageId: string;
  lastMessageAt: string;
  lastMessageKind: "slip" | "text" | "image" | "payment";
  lastMessagePreview: string;
  lastSenderRole: "customer" | "admin";
  customerReadAt: string | null;
  customerReadMessageId: string | null;
  paymentDetailsSentAt: string | null;
  myReadAt: string | null;
  myReadMessageId: string | null;
  unreadCount: number;
}
export interface InboxView {
  filter: InboxFilter;
  search: string;
}
export interface InboxCursor {
  at: string;
  orderNumber: string;
}
export interface InboxState {
  me: string;
  rows: Record<string, InboxRow>;
  order: string[];
  hasMore: boolean;
  nextCursor: InboxCursor | null;
  stale: string[];
  view: InboxView;
}
export interface InboxMessageEvent {
  conversation_id: string;
  order_number: string;
  is_new_conversation: boolean;
  message: {
    id: string;
    sender_role: "customer" | "admin";
    sender_user_id: string | null;
    kind: string;
    created_at: string;
    client_message_id: string | null;
  };
  row: {
    last_message_id: string;
    last_message_at: string;
    last_message_kind: InboxRow["lastMessageKind"];
    last_message_preview: string;
    last_sender_role: "customer" | "admin";
    payment_details_sent_at: string | null;
  };
}
export interface InboxConversationEvent {
  conversation_id: string;
  order_number: string;
  assigned_admin_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  customer_read_at: string | null;
  customer_read_message_id: string | null;
  admin_read_at: string | null;
  admin_read_message_id: string | null;
}
export interface InboxReadEvent {
  order_number: string;
  admin_user_id: string;
  last_read_at: string;
  last_read_message_id: string;
}
export type InboxAction =
  | { type: "reset"; rows: InboxRow[]; hasMore: boolean; nextCursor: InboxCursor | null; view?: InboxView }
  | { type: "append"; rows: InboxRow[]; hasMore: boolean; nextCursor: InboxCursor | null }
  | { type: "upsert_row"; row: InboxRow; activeOrderNumber?: string | null }
  | { type: "message_event"; event: InboxMessageEvent; activeOrderNumber?: string | null; activeIsRead?: boolean }
  | { type: "conversation_event"; event: InboxConversationEvent; activeOrderNumber?: string | null }
  | { type: "read_event"; event: InboxReadEvent }
  | { type: "mark_read"; orderNumber: string; at: string; messageId: string };
export function createInboxState(input: {
  me: string;
  rows?: InboxRow[];
  hasMore?: boolean;
  nextCursor?: InboxCursor | null;
  view?: Partial<InboxView>;
}): InboxState;
export function matchesView(row: InboxRow, view: InboxView, me: string, activeOrderNumber?: string | null): boolean;
export function inboxReducer(state: InboxState, action: InboxAction): InboxState;
export function visibleRows(state: InboxState): InboxRow[];
