import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { withGameArtwork } from "@/lib/game-artwork";
import { getProductDisplayName } from "@/lib/product-display-name";
import { getProductArtworkMapSafe, getProductArtworkUrlMap } from "@/lib/queries/product-artwork";
import { resolveStoreStatusSafe } from "@/lib/store-status";
import { isRobuxPlusGame, robuxPlusPresentation } from "@/config/robux-products";
import { OrderLanding } from "@/components/ordering/order-landing";
import type { StoreGame, StoreGamepass } from "@/types/database";

export const metadata: Metadata = {
  title: "Confirm your order",
  robots: { index: false, follow: false },
};

// Where a "specific product" card from the BudgetWise chat leads (0033):
// that product, preselected, with its CURRENT catalog price and
// availability (read on every request). The customer adds it to their cart
// and continues to the normal checkout — nothing is ordered from here.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function OrderProductPage({ params }: { params: Promise<{ gamepassId: string }> }) {
  const { gamepassId } = await params;
  if (!UUID_RE.test(gamepassId)) notFound();

  const supabase = createPublicClient();
  const [{ data: pass }, store] = await Promise.all([
    supabase.from("store_gamepasses").select("*").eq("id", gamepassId).maybeSingle(),
    resolveStoreStatusSafe(),
  ]);
  const product = (pass as StoreGamepass | null) ?? null;
  const { data: gameRow } = product
    ? await supabase.from("store_games").select("*").eq("id", product.game_id).maybeSingle()
    : { data: null };
  const game = gameRow ? withGameArtwork(gameRow as StoreGame) : null;

  if (!product || !game) {
    return <OrderLanding product={null} game={game ? { slug: game.slug, name: game.name } : null} storeOpen={store.status === "open"} />;
  }

  const artwork = getProductArtworkUrlMap(
    await getProductArtworkMapSafe([{ id: product.id, game_id: product.game_id, name: product.name }], { identity: null }),
  );
  const gameName = isRobuxPlusGame(game.id) ? robuxPlusPresentation.displayName : game.name;

  return (
    <OrderLanding
      storeOpen={store.status === "open"}
      game={{ slug: game.slug, name: gameName }}
      product={{
        gamepassId: product.id,
        gameId: game.id,
        gameSlug: game.slug,
        gameName,
        gameIconUrl: game.icon_url,
        name: getProductDisplayName(product),
        price: Number(product.price),
        robuxAmount: Number(product.robux_amount),
        imageUrl: artwork.get(product.id) ?? game.icon_url,
        available:
          (product.availability_status ?? "available") === "available" &&
          (game.availability_status ?? "available") === "available",
        robuxPlus: isRobuxPlusGame(game.id),
      }}
    />
  );
}
