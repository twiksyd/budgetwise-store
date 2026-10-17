import type { ConversationCache } from "./conversation-cache.mjs";

export const OPEN_THREAD_MAX_AGE_MS: number;
export const PREFETCH_CONCURRENCY: number;
export const PREFETCH_QUEUE_LIMIT: number;

export interface ConversationLoader {
  ensureThread(orderNumber: string, options?: { maxAgeMs?: number }): Promise<void>;
  ensureDetails(orderNumber: string, options?: { maxAgeMs?: number; force?: boolean }): Promise<void>;
  fetchNewer(orderNumber: string): Promise<void>;
  loadOlder(orderNumber: string): Promise<void>;
  open(orderNumber: string): { thread: Promise<void>; details: Promise<void> };
  prefetchNow(orderNumber: string): void;
  prefetchCandidates(orderNumbers: string[]): void;
  readonly queued: string[];
  readonly activePrefetches: number;
}

export function createConversationLoader<D = unknown>(options: {
  cache: ConversationCache<D>;
  fetchJson: (url: string) => Promise<unknown>;
  viewer?: "admin" | "customer";
  detailsUrl?: (orderNumber: string) => string;
  pickDetails?: (body: unknown) => D;
}): ConversationLoader;
