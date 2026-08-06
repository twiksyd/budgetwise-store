"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStoreStatus } from "@/components/shared/store-status-provider";
import { formatPrice } from "@/lib/pricing";
import { getGeneralMessengerLink } from "@/lib/messenger";
import { useCartStore, selectCartCount } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

export function CartSummary({ subtotal }: { subtotal: number }) {
  const router = useRouter();
  const status = useStoreStatus();
  const count = useCartStore(selectCartCount);
  const closeCart = useUIStore((state) => state.closeCart);

  // Explicit close-then-navigate rather than a Link nested in the button
  // (asChild) — relying on the Sheet's own onClick and Link's navigation
  // handler both firing off the same merged element wasn't reliable.
  function handleCheckout() {
    closeCart();
    router.push("/checkout");
  }

  const messengerLink = getGeneralMessengerLink();

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

      {status === "open" ? (
        <Button
          size="lg"
          className="h-12 w-full text-[15px]"
          onClick={handleCheckout}
        >
          Proceed to Checkout
          <ArrowRight className="size-4" />
        </Button>
      ) : (
        <>
          {/* Checkout is a dead end right now — don't send customers there
              just to bounce them back. Your cart is untouched either way. */}
          <p className="bg-muted/60 text-muted-foreground rounded-xl px-3.5 py-2.5 text-center text-xs leading-relaxed">
            Ordering is paused right now. Your cart is saved — message us on
            Messenger with any questions.
          </p>
          {messengerLink ? (
            <Button asChild size="lg" className="h-12 w-full text-[15px]">
              <a href={messengerLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" />
                Message us on Messenger
              </a>
            </Button>
          ) : (
            <Button disabled size="lg" className="h-12 w-full text-[15px]">
              Ordering Paused
            </Button>
          )}
        </>
      )}
    </div>
  );
}
