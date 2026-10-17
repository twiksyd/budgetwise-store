"use client";

// Opt-in diagnostics for the customer messenger, for profiling on a real
// device: `localStorage.setItem("bw:debug", "1")`, then read the console.
// Off by default; costs one localStorage read per call when off.

let enabled: boolean | null = null;

function isEnabled() {
  if (enabled === null) {
    try {
      enabled = typeof window !== "undefined" && window.localStorage.getItem("bw:debug") === "1";
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

export function debugLog(scope: string, ...details: unknown[]) {
  if (!isEnabled()) return;
  console.info(`[bw:${scope}] +${Math.round(performance.now())}ms`, ...details);
}
