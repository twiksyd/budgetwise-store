"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/pricing";
import { useUIStore } from "@/stores/ui-store";

export function CartSummary({ subtotal }: { subtotal: number }) {
  const router = useRouter();
  const closeCart = useUIStore((state) => state.closeCart);

  // Explicit close-then-navigate rather than a Link nested in the button
  // (asChild) — relying on the Sheet's own onClick and Link's navigation
  // handler both firing off the same merged element wasn't reliable.
  function handleCheckout() {
    closeCart();
    router.push("/checkout");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-heading text-base font-semibold">
          {formatPrice(subtotal)}
        </span>
      </div>
      <Button size="lg" className="h-11" onClick={handleCheckout}>
        Checkout
      </Button>
    </div>
  );
}
