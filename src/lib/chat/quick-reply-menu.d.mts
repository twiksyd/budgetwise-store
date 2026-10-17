export interface QuickReplyItem {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  isEnabled: boolean;
}
export interface QuickReplyMenuState {
  open: boolean;
  items: QuickReplyItem[];
  activeIndex: number;
  range: { start: number; end: number } | null;
  dismissedStart: number | null;
}
export type QuickReplyMenuAction =
  | { type: "input"; text: string; caret: number; replies: QuickReplyItem[] }
  | { type: "key"; key: string }
  | { type: "hover"; index: number }
  | { type: "close" };
export function detectShortcutQuery(text: string, caret: number): { start: number; end: number; query: string } | null;
export function filterQuickReplies(replies: QuickReplyItem[], query: string, limit?: number): QuickReplyItem[];
export const closedMenu: Readonly<QuickReplyMenuState>;
export function quickReplyMenuReducer(state: QuickReplyMenuState, action: QuickReplyMenuAction): QuickReplyMenuState;
export function selectedReply(state: QuickReplyMenuState): QuickReplyItem | null;
export function applyQuickReply(text: string, range: { start: number; end: number }, replyText: string): { text: string; caret: number };
