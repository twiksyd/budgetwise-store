import {
  MAX_DISTINCT_ORDER_ITEMS,
  MAX_QUANTITY_PER_PRODUCT,
} from "@/lib/validations/order";
import type { CartItem } from "@/types/domain";

// The cart-store guards (see src/stores/cart-store.ts) only stop a NEW
// add/increase from crossing these limits. A cart persisted from before
// those guards existed (or from before a limit was tightened) can still
// hold a line that's already over — this finds that state so the UI can
// flag it instead of the customer discovering it as a raw schema error at
// checkout.
export interface CartLimitViolations {
  overQuantityItems: CartItem[];
  overDistinctProducts: boolean;
  excessProductCount: number;
  hasViolations: boolean;
}

export function findCartLimitViolations(
  items: CartItem[],
): CartLimitViolations {
  const overQuantityItems = items.filter(
    (item) => item.quantity > MAX_QUANTITY_PER_PRODUCT,
  );
  const overDistinctProducts = items.length > MAX_DISTINCT_ORDER_ITEMS;

  return {
    overQuantityItems,
    overDistinctProducts,
    excessProductCount: overDistinctProducts
      ? items.length - MAX_DISTINCT_ORDER_ITEMS
      : 0,
    hasViolations: overQuantityItems.length > 0 || overDistinctProducts,
  };
}
