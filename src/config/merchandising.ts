export type ProductBadgeKind = "most-popular" | "recommended" | "new";

export const productBadgeLabels: Record<ProductBadgeKind, string> = {
  "most-popular": "Popular",
  recommended: "Recommended",
  new: "New",
};

// Business-owner-editable: mark specific gamepasses (by id, from
// store_gamepasses) to show a badge and appear in the homepage "Featured
// Products" section. "Best Value" isn't configured here — it's computed
// automatically per game from live pricing (see lib/merchandising.ts),
// since it's a factual claim rather than a curation choice.
//
// Display order on the homepage follows this object's key order (see
// getFeaturedGamepasses in lib/queries/catalog.ts) — reorder the entries
// below to reorder the section.
export const featuredGamepasses: Record<string, ProductBadgeKind> = {
  "c753f1bf-5697-497e-8235-7275e14c5b13": "recommended", // Gakuran — 50 rerolls
  "57a9ddf1-0980-4a48-a1f8-9eeb4a8130be": "most-popular", // Drag Drive Simulator — Rp 500,000,000
  "845652a9-7fdf-4ba3-91fa-b54da7ea5a26": "recommended", // Drag Drive Simulator — Dragspec Pass
  "c16890cd-22e3-4f89-aff1-5ca73f844ff3": "most-popular", // Grow a garden 2 — Rainbow carpet
};
