"use client";

import { ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { CartItems } from "@/components/cart/cart-items";
import { CartSummary } from "@/components/cart/cart-summary";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import { SupportHelpLink } from "@/components/ordering/support-help-link";
import {
  useCartStore,
  useCartHydrated,
  selectCartCount,
  selectCartSubtotal,
} from "@/stores/cart-store";

export default function CartPage() {
  const hydrated = useCartHydrated();
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const count = useCartStore(selectCartCount);

  return (
    // A barely-there neutral page tone so the white item surfaces read as
    // surfaces without heavy borders or shadows.
    <div className="bg-[color-mix(in_oklch,var(--muted)_55%,var(--background))] min-h-[calc(100dvh-4rem)] sm:min-h-[calc(100dvh-5rem)]">
      <div className="mx-auto max-w-2xl px-5 pt-4 pb-10 sm:px-6 sm:pt-10 sm:pb-20">
        <OrderingProgress currentStep={2} title="I-check ang Cart" className="sm:max-w-sm" />

        <h1 className="font-heading mt-5 flex items-baseline gap-2 text-2xl font-semibold tracking-tight sm:mt-7 sm:text-4xl">
          Your cart
          {hydrated && count > 0 && (
            <span className="text-muted-foreground text-sm font-medium tracking-normal tabular-nums sm:text-base">
              {count} {count === 1 ? "item" : "items"}
            </span>
          )}
        </h1>

        {/* Nothing until the saved cart is read, so a full cart never
            flashes the empty state first. */}
        {!hydrated ? null : items.length === 0 ? (
          <div className="mt-12">
            <EmptyState
              icon={ShoppingBag}
              title="Wala pang laman ang inyong cart."
              description="Pumili muna po ng game at item para makagawa ng order slip."
              action={{ label: "Pumili ng Game", href: "/games" }}
            />
            <div className="mt-5 flex justify-center">
              <SupportHelpLink />
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-5">
            <CartItems items={items} />
            <div className="bg-card rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] sm:p-5 dark:ring-white/[0.06]">
              <CartSummary subtotal={subtotal} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
