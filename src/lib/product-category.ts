import { Coins, Gamepad2, Gem, Gift, Timer, type LucideIcon } from "lucide-react";

export type ProductCategory =
  | "currency"
  | "gamepasses"
  | "vip"
  | "bundle"
  | "limited";

// Display order for the sectioned product grid on a game's page.
export const PRODUCT_CATEGORY_ORDER: ProductCategory[] = [
  "currency",
  "gamepasses",
  "vip",
  "bundle",
  "limited",
];

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  currency: "Currency",
  gamepasses: "Gamepasses",
  vip: "VIP",
  bundle: "Bundles",
  limited: "Limited",
};

export const PRODUCT_CATEGORY_ICONS: Record<ProductCategory, LucideIcon> = {
  currency: Coins,
  gamepasses: Gamepad2,
  vip: Gem,
  bundle: Gift,
  limited: Timer,
};

const LIMITED_PATTERN = /\blimited\b/i;
const VIP_PATTERN = /\bvip\b/i;
const BUNDLE_PATTERN = /\bbundle\b/i;

// Currency-adjacent words/symbols a gamepass name can carry around a plain
// amount ("Rp. 25,000,000", "715 R$ → 500 net (Tax Covered)", "100 Robux
// (Via plus)") — stripped out before checking whether what's left is just
// digits. A name is only classified as "currency" when it's essentially
// nothing but an amount; anything with its own descriptive words (a
// mechanic, a feature, a cosmetic) falls through to "gamepasses" instead,
// since misclassifying a feature pass as a currency top-up would be more
// misleading than leaving it in the generic bucket.
const CURRENCY_NOISE_PATTERNS = [
  /\brp\.?\b/gi,
  /\br\$/gi,
  /\brobux\b/gi,
  /\bnet\b/gi,
  /\btax\s*covered\b/gi,
  /\bno\s*tax\b/gi,
  /\bvia\s*plus\b/gi,
];

function isCurrencyName(name: string): boolean {
  let stripped = name;
  for (const pattern of CURRENCY_NOISE_PATTERNS) {
    stripped = stripped.replace(pattern, "");
  }
  stripped = stripped.replace(/[→\-()., ]/g, "");
  return stripped.length > 0 && /^\d+$/.test(stripped);
}

export function getProductCategory(name: string): ProductCategory {
  const trimmed = name.trim();
  if (LIMITED_PATTERN.test(trimmed)) return "limited";
  if (VIP_PATTERN.test(trimmed)) return "vip";
  if (BUNDLE_PATTERN.test(trimmed)) return "bundle";
  if (isCurrencyName(trimmed)) return "currency";
  return "gamepasses";
}

export function groupByCategory<T extends { name: string }>(
  items: T[],
): { category: ProductCategory; items: T[] }[] {
  const buckets = new Map<ProductCategory, T[]>();
  for (const item of items) {
    const category = getProductCategory(item.name);
    const bucket = buckets.get(category);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(category, [item]);
    }
  }

  return PRODUCT_CATEGORY_ORDER.filter((category) => buckets.has(category)).map(
    (category) => ({ category, items: buckets.get(category)! }),
  );
}
