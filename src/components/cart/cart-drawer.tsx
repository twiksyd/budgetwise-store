"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { CART_ADDED_TOAST_ID } from "@/components/cart/add-to-cart-button";
import { DesktopCartDrawer } from "@/components/cart/desktop-cart-drawer";
import { MobileCartDrawer } from "@/components/cart/mobile-cart-drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUIStore } from "@/stores/ui-store";

// Desktop keeps the original right-side panel; mobile gets the swipeable
// bottom sheet. Both share the same open/close state and inner content
// (CartPanelContent) — only the surrounding shell differs.
export function CartDrawer() {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const isCartOpen = useUIStore((state) => state.isCartOpen);
  const setCartOpen = useUIStore((state) => state.setCartOpen);

  // The cart itself now confirms the add; the toast would only sit on top.
  useEffect(() => {
    if (isCartOpen) toast.dismiss(CART_ADDED_TOAST_ID);
  }, [isCartOpen]);

  if (isDesktop) {
    return <DesktopCartDrawer open={isCartOpen} onOpenChange={setCartOpen} />;
  }

  return <MobileCartDrawer open={isCartOpen} onOpenChange={setCartOpen} />;
}
