"use client";

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

  if (isDesktop) {
    return <DesktopCartDrawer open={isCartOpen} onOpenChange={setCartOpen} />;
  }

  return <MobileCartDrawer open={isCartOpen} onOpenChange={setCartOpen} />;
}
