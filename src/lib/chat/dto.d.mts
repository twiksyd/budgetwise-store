export interface PaymentCard {
  provider: "gcash";
  label: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  currency: "PHP";
  hasQr: boolean;
}
export interface ChatMessageDto {
  id: string;
  orderNumber: string;
  senderRole: "customer" | "admin";
  kind: "slip" | "text" | "image" | "payment";
  body: string;
  hasAttachment: boolean;
  createdAt: string;
  clientMessageId: string | null;
  payment: PaymentCard | null;
  senderUserId?: string | null;
}
export interface ChatMessageRowLike {
  id: string;
  order_number: string;
  sender_role: "customer" | "admin";
  sender_user_id?: string | null;
  kind: "slip" | "text" | "image" | "payment";
  body: string | null;
  attachment_path?: string | null;
  attachment_mime?: string | null;
  payload?: unknown;
  client_message_id?: string | null;
  created_at: string;
  read_at?: string | null;
}
export function toPaymentCard(payload: unknown): PaymentCard | null;
export function toChatMessage(
  row: ChatMessageRowLike,
  options?: { viewer?: "admin" | "customer"; viewerUserId?: string | null },
): ChatMessageDto;
