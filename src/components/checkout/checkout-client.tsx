"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { OrderSummary } from "@/components/checkout/order-summary";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import { MessengerHelpLink } from "@/components/ordering/messenger-help-link";
import {
  useCartStore,
  useCartHydrated,
  selectCartSubtotal,
} from "@/stores/cart-store";

export function CheckoutClient() {
  const router = useRouter();
  const hydrated = useCartHydrated();
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);

  useEffect(() => {
    if (hydrated && items.length === 0) router.replace("/cart");
  }, [hydrated, items.length, router]);

  if (!hydrated || items.length === 0) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 sm:py-14">
      <OrderingProgress
        currentStep={3}
        compact
        description="Gagamitin namin ito para mahanap ang inyong order at Messenger conversation."
      />

      <h1 className="font-heading mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Ilagay ang Tamang Details
      </h1>
      <div className="mt-3">
        <MessengerHelpLink />
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] sm:gap-6">
        <div className="surface-premium rounded-2xl p-5 sm:p-6">
          <CheckoutForm />
        </div>
        <OrderSummary items={items} subtotal={subtotal} />
      </div>
    </div>
  );
}
