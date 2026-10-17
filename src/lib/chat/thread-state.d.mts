import type { ChatMessageDto } from "./dto.mjs";

export interface PendingMessage {
  clientMessageId: string;
  kind: "text" | "image";
  body: string;
  previewUrl?: string | null;
  createdAt: string;
  progress: number;
  status: "sending" | "failed";
  error: string | null;
}
export interface ThreadState {
  messages: ChatMessageDto[];
  pending: PendingMessage[];
  hasOlder: boolean;
  loadingOlder: boolean;
  loaded: boolean;
}
export const initialThread: Readonly<ThreadState>;
export type ThreadAction =
  | { type: "loaded"; messages: ChatMessageDto[]; hasOlder: boolean }
  | { type: "loading_older" }
  | { type: "older"; messages: ChatMessageDto[]; hasOlder: boolean }
  | { type: "received"; messages: ChatMessageDto[] }
  | { type: "send"; item: Omit<PendingMessage, "progress" | "status" | "error"> }
  | { type: "progress"; clientMessageId: string; progress: number }
  | { type: "failed"; clientMessageId: string; error: string }
  | { type: "retry"; clientMessageId: string }
  | { type: "discard"; clientMessageId: string }
  | { type: "confirmed"; clientMessageId: string; message: ChatMessageDto };
export function mergeMessages(current: ChatMessageDto[], incoming: ChatMessageDto[]): ChatMessageDto[];
export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState;
export function newestMessageId(state: ThreadState): string | null;
export function oldestMessageId(state: ThreadState): string | null;
export function countNewArrivals(
  prev: ChatMessageDto[],
  next: ChatMessageDto[],
  isMine: (message: ChatMessageDto) => boolean,
): number;
export function findFirstUnreadIndex(
  messages: ChatMessageDto[],
  cursor: { at: string | null; messageId: string | null } | null,
  isMine: (message: ChatMessageDto) => boolean,
): number;
export function isSeen(
  message: ChatMessageDto,
  cursor: { at: string | null; messageId: string | null } | null,
): boolean;
export function dayKey(iso: string): string;
export function dayLabel(iso: string, nowMs: number): string;
export type DisplayItem =
  | { type: "date"; key: string; label: string }
  | { type: "message"; key: string; message: ChatMessageDto; firstInGroup: boolean; lastInGroup: boolean };
export function buildDisplayItems(messages: ChatMessageDto[], options: { nowMs: number }): DisplayItem[];
