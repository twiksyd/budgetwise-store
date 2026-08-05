"use client";

import { useEffect } from "react";
import { useCartStore } from "@/stores/cart-store";

// Clearing here (once the order confirmation page has actually mounted)
// instead of on the checkout page avoids racing the empty-cart redirect
// guard on /checkout against the navigation away from it.
export function ClearCartOnSuccess() {
  const clearCart = useCartStore((state) => state.clear);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return null;
}
