export type ProductBadgeKind = "most-popular" | "recommended";

export const productBadgeLabels: Record<ProductBadgeKind, string> = {
  "most-popular": "Most Popular",
  recommended: "Recommended",
};

// Business-owner-editable: mark specific gamepasses (by id, from
// store_gamepasses) to show a badge and appear in the homepage "Featured
// Products" section. "Best Value" isn't configured here — it's computed
// automatically per game from live pricing (see lib/merchandising.ts),
// since it's a factual claim rather than a curation choice.
//
// This starter set picks one cheap, approachable item from a few different
// games so the section isn't empty — replace with your own picks any time.
export const featuredGamepasses: Record<string, ProductBadgeKind> = {
  "1a71baf2-eb92-40fd-b38e-ccf83c1f2ef1": "most-popular", // Grow a garden 2 — 1 roll
  "1f772fcd-4c2e-4898-a7b7-daaf044e2607": "most-popular", // Slime RNG — lucky rolls
  "cc0de4f5-52ea-4122-a827-f1d0df365222": "recommended", // Anime Squadron — Upgrade
  "a508b3b2-4dd8-4f40-a129-4c38198a98c7": "recommended", // EVADE — 30 Points
};
