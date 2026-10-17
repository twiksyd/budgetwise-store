export interface RateLimiter {
  take(key: string): { ok: boolean; retryAfterMs: number };
}
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter;
