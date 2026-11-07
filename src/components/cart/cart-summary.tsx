"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportHelpLink } from "@/components/ordering/support-help-link";
import { useStoreStatus } from "@/components/shared/store-status-provider";
import { getTikTokSupportLink } from "@/lib/support-links";
import { useCartStore, selectCartCount } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import { AnimatedPrice } from "@/components/shared/animated-price";
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

  const supportLink = getTikTokSupportLink();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-heading text-[15px] font-semibold">Total</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {count} item{count === 1 ? "" : "s"}
          </p>
        </div>
        <AnimatedPrice amount={subtotal} variant="summary" className="text-[1.75rem]/[1]" />
      </div>

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
          // Same restrained depth and press as the homepage "Umorder Na".
          className="h-12 w-full text-[15px] font-semibold sm:h-12 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_20px_-8px_color-mix(in_oklch,var(--primary)_60%,transparent)] transition-[transform,box-shadow,background-color] duration-150 active:translate-y-px active:scale-[0.99] active:shadow-[0_1px_2px_rgba(0,0,0,0.1),0_3px_8px_-4px_color-mix(in_oklch,var(--primary)_55%,transparent)]"
          onClick={handleCheckout}
        >
          Mag-checkout
          <ArrowRight className="size-4" />
        </Button>
      ) : (
        <>
          {/* Checkout is a dead end right now — don't send customers there
              just to bounce them back. Your cart is untouched either way. */}
          <p className="bg-muted/60 text-muted-foreground rounded-xl px-3.5 py-2.5 text-center text-xs leading-relaxed">
            Paused po muna ang ordering. Saved pa rin ang cart ninyo.
          </p>
          {supportLink ? (
            <Button asChild size="lg" className="h-12 w-full text-[15px] sm:h-12">
              <a href={supportLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" />
                May tanong? Message sa TikTok
              </a>
            </Button>
          ) : (
            <Button disabled size="lg" className="h-12 w-full text-[15px] sm:h-12">
              Paused ang Ordering
            </Button>
          )}
        </>
      )}

      {supportLink && (
        <div className="flex justify-center">
          <SupportHelpLink />
        </div>
      )}
    </div>
  );
}
