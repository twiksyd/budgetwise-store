import type { RateLimiter } from "./rate-limit.mjs";
export type SignalType = "viewing" | "typing" | "stopped" | "left";
export const SIGNAL_TYPES: readonly SignalType[];
export const SIGNAL_RATE_LIMIT: Readonly<{ limit: number; windowMs: number }>;
export interface SignalEvent {
  type: SignalType;
  admin_user_id: string;
  order_number: string;
  at: string;
}
export function parseSignalBody(body: unknown): { type: SignalType; orderNumber: string } | null;
export function createSignalHandler(deps: {
  resolveAdmin: () => Promise<{ id: string } | null>;
  publish: (event: SignalEvent) => Promise<void>;
  limiter: RateLimiter;
  now?: () => number;
}): (body: unknown) => Promise<{ status: number; body: unknown; retryAfterMs?: number }>;
