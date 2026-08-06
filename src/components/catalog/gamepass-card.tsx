import Image from "next/image";
import { Gamepad2 } from "lucide-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductArtworkImage } from "@/components/catalog/product-artwork-image";
import { Price } from "@/components/shared/price";
import { Badge } from "@/components/ui/badge";
import {
  ProductBadge,
  type ProductBadgeValue,
} from "@/components/catalog/product-badge";
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
  robloxIconUrl,
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
  robloxIconUrl?: string;
}) {
  const isOutOfStock = gamepass.availability_status === "out_of_stock";
  const isComingSoon = gamepass.availability_status === "coming_soon";
  const isUnavailable = isOutOfStock || isComingSoon;
  const isCurrency = category === "currency";

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

  if (isCurrency) {
    return (
      <div
        className={cn(
          "surface-premium surface-premium-hover flex h-full flex-col rounded-2xl p-3.5",
          featured &&
            "border-gold/50 bg-gold/5 border-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_42px_-18px_color-mix(in_oklch,var(--gold)_38%,transparent)]",
          isUnavailable && "opacity-70",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-lg leading-tight font-semibold text-balance [font-variant-numeric:tabular-nums]">
              {gamepass.name}
            </p>
            <p className="text-muted-foreground mt-1 text-xs font-medium">
              Currency Pack
            </p>
          </div>
          {displayBadge && <ProductBadge kind={displayBadge} />}
        </div>

        {featured && !isUnavailable && (
          <p className="text-gold-foreground dark:text-gold mt-1.5 text-xs font-medium">
            Most value for the price
          </p>
        )}

        <div className="mt-3 flex items-end justify-between gap-3">
          <Price amount={gamepass.price} />
          <div className="w-[9.25rem] max-w-[58%] shrink-0">
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
      </div>
    );
  }

  return (
    <div
      className={cn(
        "surface-premium surface-premium-hover flex h-full flex-col rounded-2xl p-3.5",
        featured &&
          "border-gold/50 bg-gold/5 border-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_42px_-18px_color-mix(in_oklch,var(--gold)_38%,transparent)]",
        isUnavailable && "opacity-70",
      )}
    >
      <div className="grid grid-cols-[4.75rem_1fr] gap-3">
        <div className="bg-muted relative aspect-square overflow-hidden rounded-2xl">
          {robloxIconUrl ? (
            <ProductArtworkImage src={robloxIconUrl} />
          ) : gameIconUrl ? (
            <Image
              src={gameIconUrl}
              alt=""
              fill
              sizes="76px"
              className="object-cover opacity-75"
            />
          ) : (
            <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-7 opacity-70" />
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex min-h-6 items-start justify-between gap-2">
            <Badge variant="secondary" className="h-6 px-2 text-[11px]">
              {gamepass.robux_amount.toLocaleString()} Robux
            </Badge>
            {displayBadge && <ProductBadge kind={displayBadge} />}
          </div>

          <h3 className="font-heading mt-1.5 text-[15px] leading-snug font-semibold text-balance">
            {gamepass.name}
          </h3>

          {featured && !isUnavailable && (
            <p className="text-gold-foreground dark:text-gold mt-1.5 text-xs font-medium">
              Most customers choose this
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <Price amount={gamepass.price} />
        <div className="w-[9.25rem] max-w-[58%] shrink-0">
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
    </div>
  );
}
