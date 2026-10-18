export interface PaymentCard {
  provider: "gcash";
  label: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  currency: "PHP";
  hasQr: boolean;
}
/** 0027: an admin verified this payment card. Never set by a receipt. */
export interface PaymentReceived {
  confirmedAt: string;
  /** Admin view only: the admin who confirmed it. */
  confirmedBy?: string | null;
}
export interface PaymentConfirmationLike {
  message_id: string;
  confirmed_at: string;
  confirmed_by?: string | null;
}
export type ChatMessageKind = "slip" | "text" | "image" | "payment" | "album";
export type AlbumLabel = "proof_of_delivery";
export interface AlbumItem {
  /** Opaque attachment id; files are served by /api/order-chat/media/<id>. */
  id: string;
  width: number | null;
  height: number | null;
}
export interface AlbumDto {
  label: AlbumLabel | null;
  items: AlbumItem[];
}
export interface ChatMessageDto {
  id: string;
  orderNumber: string;
  senderRole: "customer" | "admin";
  kind: ChatMessageKind;
  body: string;
  hasAttachment: boolean;
  createdAt: string;
  clientMessageId: string | null;
  payment: PaymentCard | null;
  paymentReceived: PaymentReceived | null;
  album: AlbumDto | null;
  senderUserId?: string | null;
  /** Customer view of an admin message: the admin's public username (never a real name or id). */
  senderName?: string | null;
}
export interface AttachmentRowLike {
  id: string;
  message_id: string;
  position: number;
  width?: number | null;
  height?: number | null;
  storage_path?: string;
  thumb_path?: string;
}
export interface ChatMessageRowLike {
  id: string;
  order_number: string;
  sender_role: "customer" | "admin";
  sender_user_id?: string | null;
  kind: ChatMessageKind;
  body: string | null;
  attachment_path?: string | null;
  attachment_mime?: string | null;
  payload?: unknown;
  client_message_id?: string | null;
  created_at: string;
  read_at?: string | null;
}
export function toPaymentCard(payload: unknown): PaymentCard | null;
export function toAlbum(payload: unknown, attachments: AttachmentRowLike[] | undefined): AlbumDto;
export function toChatMessage(
  row: ChatMessageRowLike,
  options?: {
    viewer?: "admin" | "customer";
    viewerUserId?: string | null;
    /** Attachment rows of album messages, keyed by message id. */
    attachments?: Map<string, AttachmentRowLike[]>;
    /** Admin user id -> public username, for the customer view. */
    publicNames?: Map<string, string>;
    /** Confirmations of payment messages, keyed by message id (0027). */
    paymentConfirmations?: Map<string, PaymentConfirmationLike>;
  },
): ChatMessageDto;
export function toPaymentReceived(
  confirmation: PaymentConfirmationLike | null | undefined,
  viewer: "admin" | "customer" | undefined,
): PaymentReceived | null;
