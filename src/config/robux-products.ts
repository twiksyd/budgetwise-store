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
export const robuxPlusGameId = "cc1ec858-663c-4ff2-9185-e3d587780b46";

export const robuxGameIds: string[] = [
  robuxPlusGameId, // ROBUX PLUS
];

export function isRobuxPlusGame(gameId: string): boolean {
  return gameId === robuxPlusGameId;
}

export const robuxPlusPresentation = {
  displayName: "Robux Via Plus",
  badge: "PRE-ORDER",
  processingTime: "1-8 hours after confirmed payment",
  shortProcessingTime: "1-8 HOURS PROCESSING",
  refundGuarantee:
    "If not delivered within 8 hours after confirmed payment, BudgetWise will issue a refund for the affected Via Plus order.",
} as const;
