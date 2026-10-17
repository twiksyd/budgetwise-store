// What the "Live / Reconnecting / Offline" badge shows. It is derived from
// the actual channel state — never "Live" unless the private channel is
// currently SUBSCRIBED and the browser is online.

export function deriveConnectionStatus({ online, channelState }) {
  if (!online) return "offline";
  return channelState === "SUBSCRIBED" ? "live" : "reconnecting";
}

/** Exponential backoff for re-creating a dead channel: 1s, 2s, 4s ... 30s. */
export function reconnectDelay(attempt) {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 1000 * 2 ** n);
}

/** Polling only runs while realtime is not live. */
export function pollIntervalFor(status) {
  return status === "live" ? null : status === "offline" ? null : 10_000;
}

/**
 * Whether to fetch everything missed since the last known position:
 * on every transition back to live (after the first), and when a hidden tab
 * becomes visible again.
 */
export function shouldResync({ previous, next, hasConnectedBefore, becameVisible }) {
  if (becameVisible) return true;
  return next === "live" && previous !== "live" && hasConnectedBefore;
}
