import { formatPrice } from "@/lib/pricing";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductBadge, type ProductBadgeValue } from "@/components/catalog/product-badge";
import { PRODUCT_CATEGORY_ICONS, type ProductCategory } from "@/lib/product-category";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

export function GamepassCard({
  gamepass,
  gameId,
  gameSlug,
  gameName,
  category,
  badge,
  featured = false,
}: {
  gamepass: StoreGamepass;
  gameId: string;
  gameSlug: string;
  gameName: string;
  category: ProductCategory;
  badge?: ProductBadgeValue | null;
  featured?: boolean;
}) {
  const Icon = PRODUCT_CATEGORY_ICONS[category];

  return (
    <div
      className={cn(
        "surface-premium surface-premium-hover flex h-full flex-col gap-4 rounded-2xl p-5",
        featured &&
          "border-gold/40 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_48px_-14px_color-mix(in_oklch,var(--gold)_30%,transparent)] border-2 p-6",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            featured ? "bg-gold/15" : "bg-primary/10",
          )}
        >
          <Icon className={cn("size-4", featured ? "text-gold" : "text-primary")} />
        </div>
        {badge && <ProductBadge kind={badge} />}
      </div>

      <div>
        <p className="font-heading text-[15px] leading-snug font-semibold text-balance">
          {gamepass.name}
        </p>
        <p className="text-muted-foreground mt-1 text-[13px]">
          {gamepass.robux_amount.toLocaleString()} Robux
        </p>
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
          fullWidth
        />
      </div>
    </div>
  );
}
