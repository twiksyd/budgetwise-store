"use client";

import { ShoppingBag } from "lucide-react";
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
            title="Your cart is empty."
            description="Browse our catalog to start your order."
            action={{ label: "Browse Games", href: "/games" }}
          />
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-6">
          <CartItems items={items} />
          <div className="surface-premium rounded-2xl p-6 sm:p-7">
            <CartSummary subtotal={subtotal} />
          </div>
        </div>
      )}
    </div>
  );
}
