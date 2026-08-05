"use client";

import { ShoppingBag } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { CartItems } from "@/components/cart/cart-items";
import { CartSummary } from "@/components/cart/cart-summary";
import { useCartStore, selectCartSubtotal } from "@/stores/cart-store";

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);

  return (
    <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Your cart
      </h1>

      {items.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={ShoppingBag}
            title="Your cart is empty"
            description="Browse games and add a gamepass to get started."
            action={{ label: "Browse games", href: "/games" }}
          />
        </div>
      ) : (
        <div className="surface-premium mt-10 flex flex-col gap-6 rounded-2xl p-6 sm:p-7">
          <CartItems items={items} />
          <Separator />
          <CartSummary subtotal={subtotal} />
        </div>
      )}
    </div>
  );
}
