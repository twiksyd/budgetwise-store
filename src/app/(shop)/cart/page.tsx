"use client";

import { ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { CartItems } from "@/components/cart/cart-items";
import { CartSummary } from "@/components/cart/cart-summary";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import { MessengerHelpLink } from "@/components/ordering/messenger-help-link";
import { useCartStore, selectCartSubtotal } from "@/stores/cart-store";

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 sm:py-20">
      <OrderingProgress
        currentStep={2}
        title="I-check ang Cart"
        description="Siguraduhing tama ang items at quantity bago magpatuloy."
      />

      <h1 className="font-heading mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
        Cart
      </h1>

      {items.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={ShoppingBag}
            title="Wala pang laman ang inyong cart."
            description="Pumili muna po ng game at item para makagawa ng order slip."
            action={{ label: "Pumili ng Game", href: "/games" }}
          />
          <div className="mt-5 flex justify-center">
            <MessengerHelpLink />
          </div>
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
