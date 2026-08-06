import { formatPrice } from "@/lib/pricing";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductBadge, type ProductBadgeValue } from "@/components/catalog/product-badge";
import type { ProductCategory } from "@/lib/product-category";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

// A thin top accent stripe on the two categories that most benefit from
// standing out at a glance: VIP (premium — worth paying attention to) and
// Limited (urgency — don't scroll past it). Currency and Bundle stay neutral
// so the accent doesn't turn into noise across every card on the page. A
// dedicated stripe element (rather than recoloring the card's ring) sidesteps
// having to fight surface-premium's own ring color for specificity.
const CATEGORY_CARD_STRIPE: Partial<Record<ProductCategory, string>> = {
  vip: "bg-teal-500/60",
  limited: "bg-amber-500/60",
};

export function GamepassCard({
  gamepass,
  gameId,
  gameSlug,
  gameName,
  gameIconUrl = null,
  category,
  badge,
  featured = false,
  orderingDisabled = false,
}: {
  gamepass: StoreGamepass;
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl?: string | null;
  category: ProductCategory;
  badge?: ProductBadgeValue | null;
  featured?: boolean;
  orderingDisabled?: boolean;
}) {
  const isOutOfStock = gamepass.availability_status === "out_of_stock";
  const isComingSoon = gamepass.availability_status === "coming_soon";
  const isUnavailable = isOutOfStock || isComingSoon;

  // Purchasability trumps promotional badges — a Best Value item that's
  // out of stock should say so, not keep advertising a price you can't
  // actually check out with.
  const displayBadge: ProductBadgeValue | null = isOutOfStock
    ? "out-of-stock"
    : isComingSoon
      ? "coming-soon"
      : (badge ?? null);

  const ctaLabel = isOutOfStock
    ? "Out of stock"
    : isComingSoon
      ? "Coming soon"
      : orderingDisabled
        ? "Unavailable"
        : undefined;

  // Currency packs don't really have a "name" — the amount itself is the
  // product, so it reads as a headline (tabular-nums, larger) instead of
  // a title, and the underlying Robux cost (a backend/comparison detail,
  // not something the customer is buying) is left off rather than
  // stacking a third near-duplicate number under it. The whole card leans
  // compact and centered, closer to a top-up "denomination tile" than a
  // full product card, since there's genuinely less to say about it.
  const isCurrency = category === "currency";

  // Best Value's gold treatment already commands full attention on its
  // own — layering a second category stripe on top of it would compete
  // rather than reinforce, so featured cards opt out of the stripe.
  const stripeColor = !featured ? CATEGORY_CARD_STRIPE[category] : undefined;

  return (
    <div
      className={cn(
        "surface-premium surface-premium-hover relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl p-5",
        isCurrency && "items-center gap-2.5 p-4 text-center",
        featured &&
          "border-gold/40 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_48px_-14px_color-mix(in_oklch,var(--gold)_30%,transparent)] border-2 p-6",
        isUnavailable && "opacity-70",
      )}
    >
      {stripeColor && (
        <div className={cn("absolute inset-x-0 top-0 h-1", stripeColor)} />
      )}

      {displayBadge && (
        <div className={cn("flex", isCurrency ? "justify-center" : "justify-end")}>
          <ProductBadge kind={displayBadge} />
        </div>
      )}

      <div>
        <p
          className={cn(
            "font-heading leading-snug text-balance",
            isCurrency
              ? "text-lg font-bold [font-variant-numeric:tabular-nums]"
              : "text-[15px] font-semibold",
          )}
        >
          {gamepass.name}
        </p>
        {!isCurrency && (
          <span className="bg-muted text-muted-foreground mt-1.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium">
            {gamepass.robux_amount.toLocaleString()} Robux
          </span>
        )}
      </div>

      <div
        className={cn(
          "mt-auto flex flex-col gap-3",
          isCurrency && "w-full items-center",
        )}
      >
        <p className="font-heading text-primary text-2xl font-bold [font-variant-numeric:tabular-nums]">
          {formatPrice(gamepass.price)}
        </p>
        <AddToCartButton
          gamepass={gamepass}
          gameId={gameId}
          gameSlug={gameSlug}
          gameName={gameName}
          gameIconUrl={gameIconUrl}
          fullWidth
          disabled={isUnavailable || orderingDisabled}
          label={ctaLabel}
        />
      </div>
    </div>
  );
}
