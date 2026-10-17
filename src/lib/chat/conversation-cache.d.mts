import type { ThreadAction, ThreadState } from "./thread-state.mjs";

export const CONVERSATION_CACHE_LIMIT: number;
export const INACTIVE_MESSAGE_LIMIT: number;
export const DETAILS_STALE_MS: number;
export const THREAD_STALE_MS: number;

export interface ConversationEntry<D = unknown> {
  orderNumber: string;
  thread: ThreadState;
  threadFetchedAt: number;
  threadStale: boolean;
  threadError: boolean;
  details: D | null;
  detailsFetchedAt: number;
  detailsStale: boolean;
  detailsError: boolean;
  detailsIssued: number;
  detailsApplied: number;
}

export interface PendingAlbumImage {
  name: string;
  /** Original pick, released once uploaded. */
  file: File | null;
  /** Prepared upload (image + thumbnail), released once uploaded. */
  prepared: { file: File; thumb: Blob; width: number | null; height: number | null } | null;
  width: number | null;
  height: number | null;
  uploaded: boolean;
}
export type PendingFileEntry =
  | { kind: "image"; file: File; caption: string }
  | { kind: "album"; images: PendingAlbumImage[]; caption: string; label: "proof_of_delivery" | null };

export interface ConversationCache<D = unknown> {
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  get(orderNumber: string): ConversationEntry<D> | undefined;
  has(orderNumber: string): boolean;
  keys(): string[];
  readonly size: number;
  readonly pinned: string | null;
  files: Map<string, PendingFileEntry>;
  inFlight: Set<string>;
  pin(orderNumber: string | null): void;
  touch(orderNumber: string): void;
  getThread(orderNumber: string): ThreadState;
  dispatch(orderNumber: string, action: ThreadAction, options?: { create?: boolean }): boolean;
  threadFailed(orderNumber: string): void;
  markThreadStale(orderNumber: string): boolean;
  isThreadFresh(orderNumber: string, maxAgeMs?: number): boolean;
  beginDetails(orderNumber: string): number;
  setDetails(orderNumber: string, details: D, ticket: number): boolean;
  setDetailsLocal(orderNumber: string, details: D): boolean;
  detailsFailed(orderNumber: string, ticket: number): void;
  markDetailsStale(orderNumber: string): boolean;
  isDetailsFresh(orderNumber: string, maxAgeMs?: number): boolean;
  markAllStale(): void;
}

export function createConversationCache<D = unknown>(options?: {
  limit?: number;
  inactiveMessageLimit?: number;
  now?: () => number;
}): ConversationCache<D>;
