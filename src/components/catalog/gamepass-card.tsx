import { Card } from "@/components/ui/card";
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
    <Card className="flex-row items-center justify-between p-4">
      <div>
        <p className="font-heading text-sm font-semibold">{gamepass.name}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {gamepass.robux_amount.toLocaleString()} Robux
        </p>
      </div>
      <div className="flex items-center gap-4">
        <p className="text-primary font-heading text-base font-semibold">
          {formatPrice(gamepass.price)}
        </p>
        <AddToCartButton
          gamepass={gamepass}
          gameId={gameId}
          gameSlug={gameSlug}
          gameName={gameName}
        />
      </div>
    </Card>
  );
}
