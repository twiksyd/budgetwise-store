export type ReactionKey = "love" | "haha" | "sad" | "wow" | "like";
export interface ReactionInfo {
  key: ReactionKey;
  emoji: string;
  label: string;
}
export interface MessageReactions {
  counts: Partial<Record<ReactionKey, number>>;
  mine: ReactionKey | null;
}
export const REACTIONS: readonly ReactionInfo[];
export function isReactionKey(value: unknown): value is ReactionKey;
export function reactionEmoji(key: string): string;
export function cleanCounts(counts: unknown): Partial<Record<ReactionKey, number>>;
export function summarizeReactions(
  rows: Array<{ message_id: string; actor_user_id: string; reaction: string }> | null | undefined,
  viewerUserId: string | null | undefined,
): Map<string, MessageReactions>;
export function reactionsFromEvent(
  payload: unknown,
  options: { viewer: "admin" | "customer"; me?: string | null },
): MessageReactions | null;
export function applyMyReaction(current: MessageReactions | null | undefined, next: ReactionKey | null): MessageReactions | null;
export function quotePreview(row: { kind: string; body?: string | null; payload?: unknown; order_ref?: string | null } | null | undefined, options?: { albumCount?: number }): string;
export function quotePreviewFromDto(message: { kind: string; body?: string | null; album?: { label?: string | null; items?: unknown[] } | null; orderRef?: string | null; product?: { type: string; gameName: string; productName: string | null } | null } | null | undefined): string;
