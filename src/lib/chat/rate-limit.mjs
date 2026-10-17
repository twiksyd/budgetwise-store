// Sliding-window limiter keyed by user id. In-memory, so it is per server
// instance: a cheap first line against a runaway client, not a quota.
// Clients throttle themselves well below it.
export function createRateLimiter({ limit, windowMs, now = () => Date.now(), maxKeys = 5000 }) {
  const hits = new Map();

  function take(key) {
    const current = now();
    const windowStart = current - windowMs;
    const recent = (hits.get(key) ?? []).filter((at) => at > windowStart);

    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, retryAfterMs: recent[0] + windowMs - current };
    }

    recent.push(current);
    hits.set(key, recent);

    if (hits.size > maxKeys) {
      for (const [k, times] of hits) {
        if (times.every((at) => at <= windowStart)) hits.delete(k);
      }
    }
    return { ok: true, retryAfterMs: 0 };
  }

  return { take };
}
