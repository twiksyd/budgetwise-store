import type { ChatMessageDto } from "./dto.mjs";

export interface PendingFileError {
  position: number;
  name: string;
  error: string;
}
export interface PendingMessage {
  clientMessageId: string;
  kind: "text" | "image" | "album";
  body: string;
  previewUrl?: string | null;
  /** Albums: local previews in order, and the optional label. */
  previews?: string[];
  label?: "proof_of_delivery" | null;
  createdAt: string;
  progress: number;
  /** Albums: how many images are fully uploaded. */
  uploaded: number;
  status: "sending" | "failed";
  error: string | null;
  failedFiles: PendingFileError[];
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
  | { type: "send"; item: Omit<PendingMessage, "progress" | "status" | "error" | "uploaded" | "failedFiles"> }
  | { type: "progress"; clientMessageId: string; progress: number; uploaded?: number }
  | { type: "failed"; clientMessageId: string; error: string; failedFiles?: PendingFileError[] }
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
