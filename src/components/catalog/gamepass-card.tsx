import Image from "next/image";
import { Gamepad2 } from "lucide-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductCardArtworkAccent } from "@/components/catalog/product-card-artwork-accent";
import { ProductArtworkImage } from "@/components/catalog/product-artwork-image";
import { Price } from "@/components/shared/price";
import { Badge } from "@/components/ui/badge";
import {
  ProductBadge,
  type ProductBadgeValue,
} from "@/components/catalog/product-badge";
import { getProductDisplayName } from "@/lib/product-display-name";
import {
  DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS,
  type ProductCardAccentSettings,
} from "@/lib/product-card-accent";
import type { ProductCategory } from "@/lib/product-category";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import type { StoreGamepass } from "@/types/database";

function CardBackgroundLayer({ src }: { src?: string | null }) {
  if (!src) return null;

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-[62%] overflow-hidden rounded-[inherit] [mask-image:linear-gradient(90deg,transparent,#000_55%)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-cover opacity-55 saturate-[0.85] dark:opacity-45 motion-safe:transition-[transform,opacity] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:scale-[1.05] motion-safe:group-hover:opacity-70"
      />
    </div>
  );
}

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
  cardBackgroundUrl,
  hasProductSpecificArtwork = false,
  accentSettings = DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS,
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
  cardBackgroundUrl?: string;
  hasProductSpecificArtwork?: boolean;
  accentSettings?: ProductCardAccentSettings;
}) {
  const isOutOfStock = gamepass.availability_status === "out_of_stock";
  const isComingSoon = gamepass.availability_status === "coming_soon";
  const isUnavailable = isOutOfStock || isComingSoon;
  const isCurrency = category === "currency";
  const productName = getProductDisplayName(gamepass);
  const decorativeIconUrl = hasProductSpecificArtwork ? robloxIconUrl : null;

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
      <Reveal y={14} className="h-full">
      <div
        data-product-tile
        className={cn(
          "surface-premium surface-premium-hover group relative flex h-full flex-col overflow-hidden rounded-xl p-3.5",
          featured &&
            "border-gold/50 bg-gold/5 border-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_42px_-18px_color-mix(in_oklch,var(--gold)_38%,transparent)]",
          isUnavailable && "opacity-70",
        )}
      >
        <CardBackgroundLayer src={cardBackgroundUrl} />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-lg leading-tight font-semibold text-balance [font-variant-numeric:tabular-nums]">
              {productName}
            </p>
            <p className="text-muted-foreground mt-1 text-xs font-medium">
              Currency Pack
            </p>
          </div>
          {displayBadge && <ProductBadge kind={displayBadge} />}
        </div>

        <div className="relative z-10 mt-3 flex items-end justify-between gap-3">
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
      </Reveal>
    );
  }

  return (
    <Reveal y={14} className="h-full">
    <div
      data-product-tile
      className={cn(
        "surface-premium surface-premium-hover group relative flex h-full flex-col overflow-hidden rounded-xl p-3.5",
        featured && "border-gold/60 bg-gold/[0.04]",
        isUnavailable && "opacity-70",
      )}
    >
      <CardBackgroundLayer src={cardBackgroundUrl} />
      {!cardBackgroundUrl && (
        <ProductCardArtworkAccent
          src={decorativeIconUrl}
          settings={accentSettings}
        />
      )}

      <div className="relative z-10 grid grid-cols-[4.75rem_1fr] gap-3">
        <div
          data-product-art
          className="bg-muted relative aspect-square overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10 motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:scale-[1.04]"
        >
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
            {productName}
          </h3>
        </div>
      </div>

      <div className="relative z-10 mt-3 flex items-end justify-between gap-3">
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
    </Reveal>
  );
}
