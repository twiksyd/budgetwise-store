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
import { getProductDisplayName } from "@/lib/product-display-name";
import {
  DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS,
  type ProductCardAccentSettings,
} from "@/lib/product-card-accent";
import type { ProductCategory } from "@/lib/product-category";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

function CardBackgroundLayer({ src }: { src?: string | null }) {
  if (!src) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-85 blur-[2.5px] saturate-125 motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.14] dark:opacity-70"
      />
      <div className="absolute inset-0 bg-background/30 dark:bg-background/52" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_oklch,var(--background)_88%,transparent)_0%,color-mix(in_oklch,var(--background)_68%,transparent)_38%,color-mix(in_oklch,var(--background)_24%,transparent)_72%,transparent_100%)] dark:bg-[linear-gradient(90deg,color-mix(in_oklch,var(--background)_92%,transparent)_0%,color-mix(in_oklch,var(--background)_76%,transparent)_42%,color-mix(in_oklch,var(--background)_34%,transparent)_76%,transparent_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,color-mix(in_oklch,var(--background)_86%,transparent)_0%,color-mix(in_oklch,var(--background)_52%,transparent)_28%,transparent_58%)] dark:bg-[linear-gradient(0deg,color-mix(in_oklch,var(--background)_92%,transparent)_0%,color-mix(in_oklch,var(--background)_64%,transparent)_32%,transparent_62%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_23%_27%,color-mix(in_oklch,var(--background)_82%,transparent)_0%,color-mix(in_oklch,var(--background)_58%,transparent)_24%,transparent_48%)] dark:bg-[radial-gradient(circle_at_23%_27%,color-mix(in_oklch,var(--background)_88%,transparent)_0%,color-mix(in_oklch,var(--background)_66%,transparent)_28%,transparent_52%)]" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/6 via-transparent to-background/18 dark:from-primary/10 dark:to-background/26" />
    </div>
  );
}

function DecorativeIconAccent({
  src,
  settings,
}: {
  src?: string | null;
  settings: ProductCardAccentSettings;
}) {
  if (!src || !settings.enabled) return null;

  const sizePx = Math.round(76 * (settings.scalePercent / 100));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <div className="absolute inset-y-0 right-0 w-[68%] [mask-image:linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.16)_28%,rgba(0,0,0,0.72)_58%,black_100%)]">
        <div
          className="absolute top-1/2 right-0 [mask-image:linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.12)_26%,rgba(0,0,0,0.78)_58%,black_100%)]"
          style={{
            height: `${sizePx}px`,
            width: `${sizePx}px`,
            opacity: settings.opacityPercent / 100,
            filter: `blur(${settings.blurPx}px) saturate(1.25)`,
            transform: `translate(${settings.offsetXPercent}%, calc(-50% + ${settings.offsetYPx}px))`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full rounded-[2rem] object-cover [mask-image:radial-gradient(circle_at_58%_50%,black_0%,black_58%,rgba(0,0,0,0.62)_74%,transparent_96%)] dark:mix-blend-screen dark:brightness-125 dark:saturate-150"
          />
        </div>
      </div>
      <div className="absolute inset-y-0 right-0 w-2/3 bg-gradient-to-r from-background/78 via-background/18 to-transparent dark:hidden" />
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
      <div
        className={cn(
          "surface-premium surface-premium-hover group relative flex h-full flex-col overflow-hidden rounded-2xl p-3.5",
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

        {featured && !isUnavailable && (
          <p className="text-gold-foreground dark:text-gold relative z-10 mt-1.5 text-xs font-medium">
            Most value for the price
          </p>
        )}

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
    );
  }

  return (
    <div
      className={cn(
        "surface-premium surface-premium-hover group relative flex h-full flex-col overflow-hidden rounded-2xl p-3.5",
        featured &&
          "border-gold/50 bg-gold/5 border-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_42px_-18px_color-mix(in_oklch,var(--gold)_38%,transparent)]",
        isUnavailable && "opacity-70",
      )}
    >
      <CardBackgroundLayer src={cardBackgroundUrl} />
      {!cardBackgroundUrl && (
        <DecorativeIconAccent
          src={decorativeIconUrl}
          settings={accentSettings}
        />
      )}

      <div className="relative z-10 grid grid-cols-[4.75rem_1fr] gap-3">
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
            {productName}
          </h3>

          {featured && !isUnavailable && (
            <p className="text-gold-foreground dark:text-gold mt-1.5 text-xs font-medium">
              Most customers choose this
            </p>
          )}
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
  );
}
