import Image from "next/image";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductBadge } from "@/components/catalog/product-badge";
import { Price } from "@/components/shared/price";
import { getProductDisplayName } from "@/lib/product-display-name";
import type { FeaturedGamepass } from "@/lib/queries/catalog";

export function FeaturedProductCard({
  gamepass,
  game,
  badge,
}: FeaturedGamepass) {
  const productName = getProductDisplayName(gamepass);

  return (
    <div className="surface-premium surface-premium-hover flex flex-col rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/games/${game.slug}`}
          className="flex min-w-0 items-center gap-2.5"
        >
          <div className="bg-muted relative size-8 shrink-0 overflow-hidden rounded-lg">
            {game.icon_url ? (
              <Image
                src={game.icon_url}
                alt={game.name}
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-4" />
            )}
          </div>
          <span className="text-muted-foreground truncate text-xs font-medium hover:text-foreground transition-colors">
            {game.name}
          </span>
        </Link>
        <ProductBadge kind={badge} />
      </div>

      <p className="font-heading mt-4 text-[15px] font-semibold">
        {productName}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[13px]">
        {gamepass.robux_amount.toLocaleString()} Robux
      </p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Price amount={gamepass.price} variant="productCompact" />
        <AddToCartButton
          gamepass={gamepass}
          gameId={game.id}
          gameSlug={game.slug}
          gameName={game.name}
          gameIconUrl={game.icon_url}
        />
      </div>
    </div>
  );
}
