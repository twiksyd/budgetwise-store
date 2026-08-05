"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/pricing";
import { useCartStore, selectCartCount } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

export function CartSummary({ subtotal }: { subtotal: number }) {
  const router = useRouter();
  const count = useCartStore(selectCartCount);
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
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {count} item{count === 1 ? "" : "s"}
        </span>
        <span className="font-heading text-lg font-semibold [font-variant-numeric:tabular-nums]">
          {formatPrice(subtotal)}
        </span>
      </div>
      <Button
        size="lg"
        className="h-12 w-full text-[15px]"
        onClick={handleCheckout}
      >
        Proceed to Checkout
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
