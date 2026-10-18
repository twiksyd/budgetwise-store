export const VIEWING_TTL_MS: number;
export const TYPING_TTL_MS: number;
export interface PresenceEntry {
  orderNumber: string;
  viewingUntil: number;
  typingUntil: number;
  /** 0032: the customer typing (keyed "customer:<order>", no user id). */
  customer?: boolean;
}
export type PresenceState = Readonly<Record<string, PresenceEntry>>;
export const emptyPresence: PresenceState;
export function applySignal(
  state: PresenceState,
  event: { type: string; admin_user_id?: string; order_number: string } | null | undefined,
  nowMs: number,
): PresenceState;
export function prunePresence(state: PresenceState, nowMs: number): PresenceState;
export function describeConversationPresence(
  state: PresenceState,
  orderNumber: string,
  options: { me: string; directory: Record<string, { displayName: string; publicUsername?: string | null }>; nowMs: number },
): { viewers: string[]; typers: string[]; customerTyping: boolean; text: string };
