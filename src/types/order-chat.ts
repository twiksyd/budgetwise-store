// What the browser is allowed to know about a chat message. Deliberately has
// no storage path: attachments are only ever reached through
// /api/order-chat/attachments/<id>, which re-checks access on every request.
export type ChatSenderRole = "customer" | "admin";
export type ChatMessageKind = "slip" | "text" | "image";
export type ChatViewerRole = ChatSenderRole;

export interface ChatMessage {
  id: string;
  orderNumber: string;
  senderRole: ChatSenderRole;
  kind: ChatMessageKind;
  body: string;
  hasAttachment: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface ChatMessageRowLike {
  id: string;
  order_number: string;
  sender_role: ChatSenderRole;
  kind: ChatMessageKind;
  body: string;
  attachment_path: string | null;
  created_at: string;
  read_at: string | null;
}

export function toChatMessage(row: ChatMessageRowLike): ChatMessage {
  return {
    id: row.id,
    orderNumber: row.order_number,
    senderRole: row.sender_role,
    kind: row.kind,
    body: row.body,
    hasAttachment: row.attachment_path !== null,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}
