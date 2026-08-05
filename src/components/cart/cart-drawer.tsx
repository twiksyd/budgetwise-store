"use client";

import { ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { CartItems } from "@/components/cart/cart-items";
import { CartSummary } from "@/components/cart/cart-summary";
import { useCartStore, selectCartSubtotal } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

export function CartDrawer() {
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const isCartOpen = useUIStore((state) => state.isCartOpen);
  const setCartOpen = useUIStore((state) => state.setCartOpen);

  return (
    <Sheet open={isCartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="flex flex-col gap-0">
        <SheetHeader className="border-border/60 border-b">
          <SheetTitle className="text-base">Your cart</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Browse games and add a gamepass to get started."
            />
          ) : (
            <CartItems items={items} />
          )}
        </div>

        {items.length > 0 && (
          <SheetFooter className="border-border/60 border-t">
            <CartSummary subtotal={subtotal} />
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
