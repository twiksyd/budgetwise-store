// What the "Live / Reconnecting / Offline" badge shows. It is derived from
// the actual channel state — never "Live" unless the private channel is
// currently SUBSCRIBED and the browser is online.
//
//   idle          nothing to subscribe to (no topic yet)
//   connecting    first join still in progress — normal, never a warning
//   live          SUBSCRIBED
//   reconnecting  was live (or the first join failed) and is not now
//   offline       the browser says there is no network

export function deriveConnectionStatus({ online, channelState, hasTopic = true, failedBefore = false, wasLive = false }) {
  if (!online) return "offline";
  if (!hasTopic) return "idle";
  if (channelState === "SUBSCRIBED") return "live";
  if (wasLive || failedBefore || channelState === "CLOSED" || channelState === "CHANNEL_ERROR" || channelState === "TIMED_OUT") {
    return "reconnecting";
  }
  return "connecting";
}

/** Exponential backoff for re-creating a dead channel: 1s, 2s, 4s ... 30s. */
export function reconnectDelay(attempt) {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 1000 * 2 ** n);
}

/** Polling only runs while realtime should be up but is not live. */
export function pollIntervalFor(status) {
  return status === "reconnecting" || status === "connecting" ? 10_000 : null;
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
