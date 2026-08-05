import {
  featuredGamepasses,
  type ProductBadgeKind,
} from "@/config/merchandising";
import type { StoreGamepass } from "@/types/database";

export function getConfiguredBadge(
  gamepassId: string,
): ProductBadgeKind | null {
  return featuredGamepasses[gamepassId] ?? null;
}

// The gamepass with the most Robux per peso in a given list — a factual
// comparison, not a curated claim, so it's computed rather than configured.
// Only meaningful with 2+ items to compare.
export function getBestValueId(gamepasses: StoreGamepass[]): string | null {
  if (gamepasses.length < 2) return null;

  return gamepasses.reduce((best, current) =>
    current.robux_amount / current.price > best.robux_amount / best.price
      ? current
      : best,
  ).id;
}
