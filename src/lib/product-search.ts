import { getProductDisplayName } from "@/lib/product-display-name";
import type { StoreGamepass } from "@/types/database";

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Matches against both the store display name (what the card shows) and the
// canonical/raw name (what admins configured), since a display name override
// can differ from the underlying product name customers might still search.
export function matchesProductSearch(
  gamepass: StoreGamepass,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  if (normalizeSearchText(getProductDisplayName(gamepass)).includes(normalizedQuery)) {
    return true;
  }
  return normalizeSearchText(gamepass.name).includes(normalizedQuery);
}

export function filterSectionsBySearch<T extends { items: StoreGamepass[] }>(
  sections: T[],
  normalizedQuery: string,
): T[] {
  if (!normalizedQuery) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => matchesProductSearch(item, normalizedQuery)),
    }))
    .filter((section) => section.items.length > 0);
}

export function sectionAnchorId(gameSlug: string, key: string): string {
  return `products-${gameSlug}-${key}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}
