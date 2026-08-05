import { formatPrice } from "@/lib/pricing";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import type { StoreGamepass } from "@/types/database";

export function GamepassCard({
  gamepass,
  gameId,
  gameSlug,
  gameName,
}: {
  gamepass: StoreGamepass;
  gameId: string;
  gameSlug: string;
  gameName: string;
}) {
  return (
    <div className="surface-premium surface-premium-hover flex items-center justify-between gap-4 rounded-xl px-5 py-4">
      <div className="min-w-0">
        <p className="font-heading truncate text-[15px] font-semibold">
          {gamepass.name}
        </p>
        <p className="text-muted-foreground mt-1 text-[13px]">
          {gamepass.robux_amount.toLocaleString()} Robux
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-5">
        <p className="font-heading text-lg font-semibold">
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
