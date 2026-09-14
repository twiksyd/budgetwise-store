"use client";

import { useEffect } from "react";
import { useCartStore, useCartHydrated } from "@/stores/cart-store";
import {
  clearPendingOrderClear,
  readPendingOrderClear,
} from "@/lib/pending-order-clear";

// Clearing here (once the order confirmation page has actually mounted)
// instead of on the checkout page avoids racing the empty-cart redirect
// guard on /checkout against the navigation away from it.
//
// Only the items recorded for THIS order at submit time are removed, and
// the pending record is deleted immediately after — so revisiting an old
// confirmation, refreshing this page, or using Back/Forward never clears
// items the customer added since, and never clears anything twice.
export function ClearCartOnSuccess({ orderNumber }: { orderNumber: string }) {
  const hydrated = useCartHydrated();
  const removeOrderedItems = useCartStore((state) => state.removeOrderedItems);

  useEffect(() => {
    if (!hydrated) return;

    const pending = readPendingOrderClear(orderNumber);
    if (!pending || pending.length === 0) return;

    removeOrderedItems(pending);
    clearPendingOrderClear(orderNumber);
  }, [hydrated, orderNumber, removeOrderedItems]);

  return null;
}
