"use client";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { EmptyState } from "@/components/shared/empty-state";
import { CartItems } from "@/components/cart/cart-items";
import { CartSummary } from "@/components/cart/cart-summary";
import { useCartStore, selectCartSubtotal } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

// Two heights instead of one fixed sheet: opens at a comfortable default
// (a few items visible without covering the whole screen) and swiping up
// reveals the rest of a longer cart at near-full height. vaul owns the
// drag physics — dragging below the lower snap point continues into its
// default dismiss gesture, same as tapping the overlay.
const SNAP_POINTS = [0.6, 0.95];

export function CartDrawer() {
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const isCartOpen = useUIStore((state) => state.isCartOpen);
  const setCartOpen = useUIStore((state) => state.setCartOpen);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

  return (
    <Drawer
      open={isCartOpen}
      onOpenChange={setCartOpen}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[95vh] rounded-t-3xl">
        <DrawerHeader className="border-border/60 shrink-0 border-b pb-4">
          <DrawerTitle className="text-base">Your cart</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          {items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty."
              description="Browse our catalog to start your order."
              action={{ label: "Browse Games", href: "/games" }}
              onActionClick={() => setCartOpen(false)}
            />
          ) : (
            <CartItems items={items} />
          )}
        </div>

        {items.length > 0 && (
          <div className="border-border/60 bg-popover shrink-0 border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <CartSummary subtotal={subtotal} />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
