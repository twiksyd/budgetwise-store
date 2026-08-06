// Business-owner-editable: games that are really "buy Robux" products
// rather than a specific title's gamepasses/currency — pulled into their
// own "Robux" section on /games instead of sitting in the regular catalog
// grid next to actual games. IDs queried live from Supabase, not guessed
// from names.
//
// "Robux Sell" (the old flat game covering both tax types) is deliberately
// not listed here — it's now hidden entirely (see migration 0005) and
// replaced by the merged "Robux (Via Link)" page, added as a synthetic tile
// alongside this list in games-explorer.tsx rather than resolved from a
// real `games` row.
export const robuxGameIds: string[] = [
  "cc1ec858-663c-4ff2-9185-e3d587780b46", // ROBUX PLUS
];
