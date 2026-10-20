"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, Gamepad2, LayoutGrid, Minus, PackageSearch, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { RobuxPlusPageGate } from "@/components/catalog/robux-plus-acknowledgement";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import { useCartHydrated, useCartStore } from "@/stores/cart-store";
import { MAX_QUANTITY_PER_PRODUCT } from "@/lib/validations/order";
import { recommendationFromLocation, rememberRecommendation } from "@/lib/recommendation-session";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export interface LandingProduct {
  gamepassId: string;
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl: string | null;
  name: string;
  price: number;
  robuxAmount: number;
  imageUrl: string | null;
  available: boolean;
  robuxPlus: boolean;
}

/**
 * "Confirm & order" from a product card in the BudgetWise chat (0033): the
 * product is preselected at its current price; the customer picks how many,
 * adds it to their cart and continues to the usual checkout, where they
 * review everything and fill in their details. Nothing is ordered here.
 */
export function OrderLanding({
  product,
  game,
  storeOpen,
}: {
  product: LandingProduct | null;
  game: { slug: string; name: string } | null;
  storeOpen: boolean;
}) {
  const router = useRouter();
  const hydrated = useCartHydrated();
  const inCart = useCartStore((state) => (product ? (state.items.find((item) => item.gamepassId === product.gamepassId)?.quantity ?? 0) : 0));
  const [quantity, setQuantity] = useState(1);
  const [fromChat, setFromChat] = useState<string | null>(null);
  const [going, setGoing] = useState(false);

  useEffect(() => {
    const rec = recommendationFromLocation();
    setFromChat(rec);
    if (rec && product) rememberRecommendation({ id: rec, gameId: product.gameId, gamepassId: product.gamepassId });
  }, [product]);

  // Already in the cart: start from that quantity (never add it twice).
  useEffect(() => {
    if (hydrated && inCart > 0) setQuantity(inCart);
  }, [hydrated, inCart]);

  if (!product) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
        <span className="bg-muted flex size-14 items-center justify-center rounded-2xl">
          <PackageSearch className="text-muted-foreground size-7" aria-hidden />
        </span>
        <h1 className="font-heading mt-4 text-xl font-semibold">This item is no longer available</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          It may have been updated or removed from the catalog. You can still browse everything we have.
        </p>
        <Link
          href={game ? `/games/${game.slug}` : "/games"}
          className="bg-primary text-primary-foreground mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-semibold"
        >
          {game ? `Browse ${game.name}` : "Browse games"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const orderable = product.available && storeOpen;
  const total = product.price * quantity;

  function continueToCheckout() {
    if (!product || !orderable || going) return;
    setGoing(true);
    const store = useCartStore.getState();
    const existing = store.items.find((item) => item.gamepassId === product.gamepassId);
    const result = existing
      ? store.setQuantity(product.gamepassId, quantity)
      : store.addItem(
          {
            gamepassId: product.gamepassId,
            gameId: product.gameId,
            gameSlug: product.gameSlug,
            gameName: product.gameName,
            gameIconUrl: product.gameIconUrl,
            name: product.name,
            robuxAmount: product.robuxAmount,
            price: product.price,
          },
          quantity,
        );
    if (!result.ok) {
      setGoing(false);
      toast.error(
        result.reason === "MAX_PRODUCTS"
          ? "Your cart already has the maximum number of different products."
          : `You can order up to ${MAX_QUANTITY_PER_PRODUCT} of this item.`,
      );
      return;
    }
    router.push("/checkout");
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-12">
      {product.robuxPlus && <RobuxPlusPageGate />}
      <OrderingProgress currentStep={2} compact />

      <nav className="text-muted-foreground mt-5 flex min-w-0 items-center gap-1.5 text-xs sm:text-sm" aria-label="Breadcrumb">
        <Link href="/games" className="hover:text-foreground shrink-0 transition-colors">
          Games
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <Link href={`/games/${product.gameSlug}`} className="hover:text-foreground truncate transition-colors">
          {product.gameName}
        </Link>
      </nav>

      <section className="bw-card-in surface-premium mt-4 overflow-hidden rounded-xl" aria-labelledby="order-landing-title">
        {fromChat && (
          <p className="bg-primary/[0.07] text-primary flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold">
            <Sparkles className="size-3.5" aria-hidden />
            Picked for you by BudgetWise in your chat
          </p>
        )}
        <div className="flex gap-4 p-5 sm:gap-5 sm:p-6">
          <div className="bg-muted relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl sm:size-28">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
              <img src={product.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <Gamepad2 className="text-muted-foreground size-8" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground truncate text-xs font-semibold tracking-wide uppercase">{product.gameName}</p>
            <h1 id="order-landing-title" className="font-heading mt-1 text-xl leading-tight font-semibold break-words sm:text-2xl">
              {product.name}
            </h1>
            {product.robuxAmount > 0 && (
              <p className="text-muted-foreground mt-1 text-sm [font-variant-numeric:tabular-nums]">
                {product.robuxAmount.toLocaleString()} Robux
              </p>
            )}
            <p className="font-heading mt-2 text-2xl font-bold [font-variant-numeric:tabular-nums]">{formatPrice(product.price)}</p>
            <p className="text-muted-foreground text-[11px]">Current price · checked just now</p>
          </div>
        </div>

        {orderable ? (
          <div className="border-border/60 border-t p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Quantity</span>
              <div className="border-border flex items-center rounded-lg border">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  disabled={quantity <= 1}
                  className="hover:bg-muted inline-flex size-11 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-9 text-center text-base font-semibold [font-variant-numeric:tabular-nums]" aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(MAX_QUANTITY_PER_PRODUCT, value + 1))}
                  disabled={quantity >= MAX_QUANTITY_PER_PRODUCT}
                  className="hover:bg-muted inline-flex size-11 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={continueToCheckout}
              disabled={going}
              className={cn(
                "bg-primary text-primary-foreground mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-semibold",
                "shadow-[0_12px_28px_-16px_color-mix(in_oklch,var(--primary)_70%,transparent)] transition-[transform,background-color] duration-150 active:scale-[0.985] motion-reduce:active:scale-100",
                "hover:bg-primary/90 disabled:opacity-70",
              )}
              data-testid="order-landing-continue"
            >
              {going ? "Opening checkout…" : `Continue · ${formatPrice(total)}`}
              {!going && <ArrowRight className="size-4" aria-hidden />}
            </button>
            <p className="text-muted-foreground mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed">
              <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              Nothing is ordered yet. You&apos;ll review your order and enter your details first
              {inCart > 0 ? " — this item is already in your cart, so we'll just update the quantity." : "."}
            </p>
          </div>
        ) : (
          <div className="border-border/60 text-muted-foreground border-t p-5 text-sm sm:p-6">
            {storeOpen ? "This item can't be ordered right now." : "Ordering is paused at the moment. Please check back soon."}
          </div>
        )}
      </section>

      <Link
        href={`/games/${product.gameSlug}${fromChat ? `?rec=${fromChat}` : ""}`}
        className="border-border hover:bg-muted/60 mt-3 flex min-h-12 items-center gap-3 rounded-2xl border px-4 text-sm font-semibold transition-colors"
      >
        <LayoutGrid className="text-primary size-4" aria-hidden />
        <span className="flex-1">Add more from {product.gameName}</span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden />
      </Link>
    </div>
  );
}
