import { formatPrice } from "@/lib/pricing";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductBadge, type ProductBadgeValue } from "@/components/catalog/product-badge";
import type { StoreGamepass } from "@/types/database";

export function GamepassCard({
  gamepass,
  gameId,
  gameSlug,
  gameName,
  badge,
}: {
  gamepass: StoreGamepass;
  gameId: string;
  gameSlug: string;
  gameName: string;
  badge?: ProductBadgeValue | null;
}) {
  return (
    <div className="surface-premium surface-premium-hover flex items-center justify-between gap-4 rounded-xl px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-heading truncate text-[15px] font-semibold">
            {gamepass.name}
          </p>
          {badge && <ProductBadge kind={badge} />}
        </div>
        <p className="text-muted-foreground mt-1 text-[13px]">
          {gamepass.robux_amount.toLocaleString()} Robux
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <p className="font-heading text-primary min-w-[4.5ch] text-right text-xl font-bold [font-variant-numeric:tabular-nums]">
          {formatPrice(gamepass.price)}
        </p>
        <AddToCartButton
          gamepass={gamepass}
          gameId={gameId}
          gameSlug={gameSlug}
          gameName={gameName}
        />
      </div>
    </div>
  );
}
