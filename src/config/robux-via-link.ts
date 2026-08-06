// "Robux (Via Link)" isn't a real row in `games` — it's a Store-side merge
// of two live inventory games ("Robux Sell — Covered Tax" and "Robux Sell —
// No Tax") into a single page with two clearly-labeled sections, so
// customers pick a tax option once instead of finding two near-identical
// game cards in the catalog. Both source games are hidden from the regular
// catalog (see supabase/migrations/0005_catalog_data_integrity.sql) — their
// gamepasses are queried directly by these ids for this page only.
export const robuxViaLinkGameIds = {
  coveredTax: "bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75",
  notCoveredTax: "e5318653-6b19-417c-9f89-1a7baa2331aa",
} as const;

// Display metadata for the catalog tile linking to this page — reuses the
// existing "Robux Sell" artwork/color since neither source game had its own
// thumbnail, and this is the same icon customers already recognize from the
// Robux section today.
export const robuxViaLinkTile = {
  name: "Robux (Via Link)",
  slug: "robux-via-link",
  iconUrl: "/icons/robux-sell.png",
  color: "#22d3ee",
};
