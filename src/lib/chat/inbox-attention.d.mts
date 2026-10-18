import type { InboxRow } from "./inbox-state.mjs";
export const REPLY_KINDS: readonly ["text", "image", "album"];
export type AttentionLevel = "high" | "medium" | "low";
interface MessageLike {
  id: string;
  sender_role: "customer" | "admin";
  sender_user_id?: string | null;
  kind: string;
  created_at: string;
}
export function isAdminReply(message: Partial<MessageLike> | null | undefined): boolean;
export function needsReply(row: InboxRow | null | undefined): boolean;
export function repliedBy(row: InboxRow | null | undefined): string | null;
export function viewedByOthers(row: InboxRow | null | undefined, me: string): string[];
export function isNewAttention(row: InboxRow | null | undefined): boolean;
export function attentionLevel(row: InboxRow | null | undefined, me: string): AttentionLevel;
export function applyMessageToReplyState<T extends InboxRow>(row: T, message: MessageLike): T;
export function applyReadToViewedBy<T extends InboxRow>(row: T, adminId: string, at: string, messageId: string): T;
