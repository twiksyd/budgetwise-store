import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronRight,
  Clock,
  Construction,
  Gamepad2,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";
import {
  getGameBySlug,
  getGamepassesByGameId,
} from "@/lib/queries/catalog";
import {
  getProductArtworkMap,
  getProductArtworkUrlMap,
} from "@/lib/queries/product-artwork";
import { GamepassList } from "@/components/catalog/gamepass-list";
import { BloxFruitsProductList } from "@/components/catalog/blox-fruits-product-list";
import { GrowAGarden2ProductList } from "@/components/catalog/grow-a-garden-2-product-list";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import { robloxUniverseIds } from "@/config/roblox-universe-ids";
import { BLOX_FRUITS_GAME_ID } from "@/config/blox-fruits";
import { GROW_A_GARDEN_2_GAME_ID } from "@/config/grow-a-garden-2";
import { resolveStoreStatusSafe } from "@/lib/store-status";

export const revalidate = 60;

type Props = {
  params: Promise<{ gameSlug: string }>;
};

// These games were merged into a single page (see
// supabase/migrations/0005_catalog_data_integrity.sql and
// config/robux-via-link.ts) and are now hidden from store_games — a request
// for their old slug should land customers on the merged page instead of a
// 404, since links to them may already be shared/bookmarked.
const ROBUX_MERGE_REDIRECT_SLUGS = new Set([
  "robux-sell",
  "robux-sell-covered-tax",
  "robux-sell-no-tax",
]);

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { gameSlug } = await params;

  if (ROBUX_MERGE_REDIRECT_SLUGS.has(gameSlug)) {
    return { title: "Robux (Via Link)" };
  }

  const game = await getGameBySlug(gameSlug);

  if (!game) return {};

  return {
    title: game.name,
    description: `Buy discounted Robux gamepasses for ${game.name} on BudgetWise.`,
  };
}

export default async function GameDetailPage({ params }: Props) {
  const { gameSlug } = await params;

  if (ROBUX_MERGE_REDIRECT_SLUGS.has(gameSlug)) {
    redirect("/games/robux-via-link");
  }

  const storeStatusPromise = resolveStoreStatusSafe();
  const game = await getGameBySlug(gameSlug);

  if (!game) notFound();

  const [gamepasses, { status: storeStatus }] = await Promise.all([
    getGamepassesByGameId(game.id),
    storeStatusPromise,
  ]);

  const productArtwork = await getProductArtworkMap(
    gamepasses.map((g) => g.id),
    { includeRoblox: Boolean(robloxUniverseIds[game.id]) },
  );
  const productArtworkUrls = getProductArtworkUrlMap(productArtwork);

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 sm:py-14">
      <OrderingProgress
        currentStep={2}
        description="Piliin at i-add sa cart ang gamepasses o items na gusto ninyong bilhin."
      />

      <nav className="text-muted-foreground mt-5 flex items-center gap-1.5 text-xs sm:text-sm">
        <Link href="/games" className="hover:text-foreground transition-colors">
          Games
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{game.name}</span>
      </nav>

      <section className="mt-4 flex items-center gap-3.5 sm:gap-6">
        <div
          className="surface-premium relative flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-2xl sm:size-28 sm:rounded-3xl"
          style={game.color ? { backgroundColor: `${game.color}1a` } : undefined}
        >
          {game.icon_url ? (
            <Image
              src={game.icon_url}
              alt={game.name}
              fill
              sizes="(min-width: 640px) 112px, 72px"
              className="object-cover"
            />
          ) : (
            <Gamepad2 className="text-muted-foreground size-8" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs font-medium">
            {game.category && <span>{game.category}</span>}
            {game.category && <span className="text-muted-foreground/40">/</span>}
            <span>
              {gamepasses.length} product{gamepasses.length === 1 ? "" : "s"} available
            </span>
          </div>
          <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-5xl">
            {game.name}
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed sm:text-base">
            Piliin ang items sa baba, tapos i-add sa cart.
          </p>
        </div>
      </section>

      <div className="bg-muted/70 text-muted-foreground mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl px-3 py-2 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" />
          No payment on-site
        </span>
        <span aria-hidden>·</span>
        <span>Messenger confirmation</span>
        <span aria-hidden>·</span>
        <span>Delivered to your Roblox username</span>
      </div>

      {game.availability_status === "temporarily_unavailable" ? (
        <div className="mt-12">
          <EmptyState
            icon={Construction}
            title="Temporarily Unavailable"
            description="We're currently restocking this game. No orders may be placed."
            action={{ label: "Browse other games", href: "/games" }}
          />
        </div>
      ) : game.availability_status === "coming_soon" ? (
        <div className="mt-12">
          <EmptyState
            icon={Clock}
            title="Coming Soon"
            description="This game isn't available to order yet — check back soon."
            action={{ label: "Browse other games", href: "/games" }}
          />
        </div>
      ) : gamepasses.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={PackageSearch}
            title="No gamepasses available"
            description="This game doesn't have any active gamepasses right now. Check back soon."
            action={{ label: "Browse other games", href: "/games" }}
          />
        </div>
      ) : game.id === BLOX_FRUITS_GAME_ID ? (
        <BloxFruitsProductList
          gamepasses={gamepasses}
          gameId={game.id}
          gameSlug={game.slug}
          gameName={game.name}
          gameIconUrl={game.icon_url}
          orderingDisabled={storeStatus !== "open"}
          robloxIconUrls={productArtworkUrls}
        />
      ) : game.id === GROW_A_GARDEN_2_GAME_ID ? (
        <GrowAGarden2ProductList
          gamepasses={gamepasses}
          gameId={game.id}
          gameSlug={game.slug}
          gameName={game.name}
          gameIconUrl={game.icon_url}
          orderingDisabled={storeStatus !== "open"}
          robloxIconUrls={productArtworkUrls}
        />
      ) : (
        <GamepassList
          gamepasses={gamepasses}
          gameId={game.id}
          gameSlug={game.slug}
          gameName={game.name}
          gameIconUrl={game.icon_url}
          orderingDisabled={storeStatus !== "open"}
          robloxIconUrls={productArtworkUrls}
        />
      )}
    </div>
  );
}
