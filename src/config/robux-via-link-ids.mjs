// The two live inventory games merged into the "Robux (Via Link)" page.
// Plain .mjs so server code, client code and node:test scripts share one
// source of truth (re-exported by src/config/robux-via-link.ts).
export const ROBUX_VIA_LINK_GAME_IDS = Object.freeze({
  coveredTax: "bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75",
  notCoveredTax: "e5318653-6b19-417c-9f89-1a7baa2331aa",
});

const viaLinkGameIdSet = new Set(Object.values(ROBUX_VIA_LINK_GAME_IDS));

export function isRobuxViaLinkGameId(gameId) {
  return typeof gameId === "string" && viaLinkGameIdSet.has(gameId);
}
