"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { OrderSummary } from "@/components/checkout/order-summary";
import { WhatHappensNext } from "@/components/checkout/what-happens-next";
import {
  useCartStore,
  useCartHydrated,
  selectCartSubtotal,
} from "@/stores/cart-store";

export default function CheckoutPage() {
  const router = useRouter();
  const hydrated = useCartHydrated();
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);

  useEffect(() => {
    if (hydrated && items.length === 0) router.replace("/cart");
  }, [hydrated, items.length, router]);

  if (!hydrated || items.length === 0) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Checkout
      </h1>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 sm:gap-8">
        <div className="surface-premium rounded-2xl p-6 sm:p-7">
          <CheckoutForm />
        </div>
        <OrderSummary items={items} subtotal={subtotal} />
      </div>
      <WhatHappensNext />
    </div>
  );
}
