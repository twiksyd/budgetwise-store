// Blox Fruits is one `games` row with 55 live gamepasses (see
// store_gamepasses), but unlike every other game it needs to display as
// three distinct sections — Gamepasses, EXP Boosts, Permanent Fruits —
// instead of the single flat/auto-categorized list `GamepassList` renders
// for everything else. `public.gamepasses` (XOB-owned) has no product-type
// column to key off, so this is a Store-side display classification only,
// same pattern as config/robux-via-link.ts — it never touches XOB's schema
// or data, only how the Store groups what's already there.
export const BLOX_FRUITS_GAME_ID = "155d2360-c956-4982-9965-9a0b303d749e";

// The 10 non-EXP gamepasses confirmed against the live catalog. Everything
// else in this game defaults to "Permanent Fruits" (see
// classifyBloxFruitsProduct below) — so a new fruit XOB adds later shows up
// automatically, but a new *gamepass* needs its name added here or it will
// be miscategorized as a fruit until this list is updated.
const GAMEPASS_NAMES = new Set([
  "Dark Blade",
  "Fruit Notifier",
  "2x Mastery",
  "2x Money",
  "Fast Boats",
  "2x Drop Chance",
  "1 Fruit Storage",
  "Change Race",
  "Refund Stats",
  "Respawn Bosses",
]);

// Every EXP product in the live catalog ends with "EXP" ("24 Hours EXP",
// "1 Hour EXP", "15 Mins EXP", ...) — a reliable, low-maintenance match that
// doesn't need a per-item list like the gamepasses above.
const EXP_BOOST_PATTERN = /\bEXP$/i;

export type BloxFruitsSection = "gamepasses" | "exp" | "fruits";

export const BLOX_FRUITS_SECTION_ORDER: BloxFruitsSection[] = [
  "gamepasses",
  "exp",
  "fruits",
];

export const BLOX_FRUITS_SECTION_LABELS: Record<BloxFruitsSection, string> = {
  gamepasses: "Gamepasses",
  exp: "EXP Boosts",
  fruits: "Permanent Fruits",
};

export function classifyBloxFruitsProduct(name: string): BloxFruitsSection {
  const trimmed = name.trim();
  if (GAMEPASS_NAMES.has(trimmed)) return "gamepasses";
  if (EXP_BOOST_PATTERN.test(trimmed)) return "exp";
  return "fruits";
}
