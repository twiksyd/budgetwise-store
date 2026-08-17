// Grow a garden 2's generic category classifier (lib/product-category.ts)
// has no pattern for "FALL EGG" roll bundles, so all 4 land in the same
// flat "Gamepasses" bucket as the game's other 4 unrelated products
// (Grappling Hook, Power Hose, Rainbow Carpet, Vine Wrapper). This pulls
// just the FALL EGG bundle into its own labeled section — same per-game
// override pattern as config/blox-fruits.ts — without teaching the
// site-wide classifier a name pattern that's only meaningful for this one
// game's seasonal item.
export const GROW_A_GARDEN_2_GAME_ID = "ec7b0020-d616-485b-a151-f5fc2d541c9b";

// Case-insensitive so a catalog re-casing (e.g. "1 roll FALL EGG" ->
// "1 Roll Fall Egg") doesn't silently drop these back into the generic
// bucket — matches on structure (count + "roll" + "fall egg"), not exact case.
const FALL_EGG_PATTERN = /^\d+\s*roll\s*fall\s*egg$/i;

export function isFallEggProduct(name: string): boolean {
  return FALL_EGG_PATTERN.test(name.trim());
}
