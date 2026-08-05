"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { OrderSummary } from "@/components/checkout/order-summary";
import { useCartStore, selectCartSubtotal } from "@/stores/cart-store";

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);

  useEffect(() => {
    if (items.length === 0) router.replace("/cart");
  }, [items.length, router]);

  if (items.length === 0) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Checkout
      </h1>
      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <CheckoutForm />
        <OrderSummary items={items} subtotal={subtotal} />
      </div>
    </div>
  );
}
