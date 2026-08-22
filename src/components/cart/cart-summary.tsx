"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessengerHelpLink } from "@/components/ordering/messenger-help-link";
import { useStoreStatus } from "@/components/shared/store-status-provider";
import { getGeneralMessengerLink } from "@/lib/messenger";
import { Price } from "@/components/shared/price";
import { useCartStore, selectCartCount } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import { isRobuxPlusGame, robuxPlusPresentation } from "@/config/robux-products";

export function CartSummary({ subtotal }: { subtotal: number }) {
  const router = useRouter();
  const status = useStoreStatus();
  const count = useCartStore(selectCartCount);
  const hasRobuxPlus = useCartStore((state) =>
    state.items.some((item) => isRobuxPlusGame(item.gameId)),
  );
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
        <Price amount={subtotal} variant="cart" />
      </div>

      <p className="bg-amber-500/10 text-amber-950 dark:text-amber-100 border-amber-500/20 rounded-xl border px-3.5 py-2.5 text-center text-xs leading-relaxed">
        Wala pa pong kailangang bayaran.
      </p>

      {hasRobuxPlus && (
        <div className="border-red-500/25 bg-red-500/10 text-red-950 dark:text-red-100 rounded-2xl border px-3.5 py-3 text-xs leading-relaxed">
          <p className="text-[11px] font-black tracking-[0.16em] text-red-700 uppercase dark:text-red-300">
            {robuxPlusPresentation.badge} - ROBUX VIA PLUS
          </p>
          <p className="font-heading mt-1 text-2xl font-black tracking-tight">
            1-8 HOURS
          </p>
          <p className="mt-1 font-medium">
            Applies only to Via Plus items after confirmed payment.
          </p>
          <p className="mt-2 opacity-90">
            Not delivered within 8 hours after confirmed payment? The affected
            Via Plus order will be refunded.
          </p>
        </div>
      )}

      {status === "open" ? (
        <Button
          size="lg"
          className="h-12 w-full text-[15px]"
          onClick={handleCheckout}
        >
          Magpatuloy sa Checkout
          <ArrowRight className="size-4" />
        </Button>
      ) : (
        <>
          {/* Checkout is a dead end right now — don't send customers there
              just to bounce them back. Your cart is untouched either way. */}
          <p className="bg-muted/60 text-muted-foreground rounded-xl px-3.5 py-2.5 text-center text-xs leading-relaxed">
            Paused po muna ang ordering. Saved pa rin ang cart ninyo.
          </p>
          {messengerLink ? (
            <Button asChild size="lg" className="h-12 w-full text-[15px]">
              <a href={messengerLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" />
                I-message kami sa Messenger
              </a>
            </Button>
          ) : (
            <Button disabled size="lg" className="h-12 w-full text-[15px]">
              Paused ang Ordering
            </Button>
          )}
        </>
      )}

      <div className="flex justify-center pt-1">
        <MessengerHelpLink />
      </div>
    </div>
  );
}
