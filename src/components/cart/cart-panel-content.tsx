"use client";

import { ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { CartItems } from "@/components/cart/cart-items";
import { CartSummary } from "@/components/cart/cart-summary";
import { useCartStore, selectCartSubtotal } from "@/stores/cart-store";

// Shared between the desktop side panel and the mobile bottom sheet — only
// the surrounding shell (Sheet vs. Drawer) differs between breakpoints.
export function CartPanelContent({ onClose }: { onClose: () => void }) {
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);

  return (
    <>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {items.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Your cart is empty."
            description="Browse our catalog to start your order."
            action={{ label: "Browse Games", href: "/games" }}
            onActionClick={onClose}
          />
        ) : (
          <CartItems items={items} />
        )}
      </div>

      {items.length > 0 && (
        <div className="border-border/60 bg-popover shrink-0 border-t px-4 pt-4 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))]">
          <CartSummary subtotal={subtotal} />
        </div>
      )}
    </>
  );
}
