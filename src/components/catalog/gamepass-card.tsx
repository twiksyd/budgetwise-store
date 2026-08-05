import { formatPrice } from "@/lib/pricing";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductBadge, type ProductBadgeValue } from "@/components/catalog/product-badge";
import type { ProductCategory } from "@/lib/product-category";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

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
  // stacking a third near-duplicate number under it.
  const isCurrency = category === "currency";

  return (
    <div
      className={cn(
        "surface-premium surface-premium-hover flex h-full flex-col gap-3 rounded-2xl p-5",
        featured &&
          "border-gold/40 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_48px_-14px_color-mix(in_oklch,var(--gold)_30%,transparent)] border-2 p-6",
        isUnavailable && "opacity-70",
      )}
    >
      {displayBadge && (
        <div className="flex justify-end">
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
          <p className="text-muted-foreground mt-1 text-[13px]">
            {gamepass.robux_amount.toLocaleString()} Robux
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3">
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
