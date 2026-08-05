import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, Construction, Gamepad2, PackageSearch } from "lucide-react";
import { getGameBySlug, getGamepassesByGameId } from "@/lib/queries/catalog";
import { GamepassList } from "@/components/catalog/gamepass-list";
import { EmptyState } from "@/components/shared/empty-state";
import { resolveStoreStatusSafe } from "@/lib/store-status";

export const revalidate = 60;

type Props = {
  params: Promise<{ gameSlug: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { gameSlug } = await params;
  const game = await getGameBySlug(gameSlug);

  if (!game) return {};

  return {
    title: game.name,
    description: `Buy discounted Robux gamepasses for ${game.name} on BudgetWise.`,
  };
}

export default async function GameDetailPage({ params }: Props) {
  const { gameSlug } = await params;
  const game = await getGameBySlug(gameSlug);

  if (!game) notFound();

  const [gamepasses, { status: storeStatus }] = await Promise.all([
    getGamepassesByGameId(game.id),
    resolveStoreStatusSafe(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <nav className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/games" className="hover:text-foreground transition-colors">
          Games
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{game.name}</span>
      </nav>

      <div className="mt-6 flex items-center gap-4">
        <div
          className="surface-premium relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
          style={game.color ? { backgroundColor: `${game.color}1a` } : undefined}
        >
          {game.icon_url ? (
            <Image
              src={game.icon_url}
              alt={game.name}
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <Gamepad2 className="text-muted-foreground size-7" />
          )}
        </div>
        <div>
          {game.category && (
            <p className="text-muted-foreground text-sm">{game.category}</p>
          )}
          <h1 className="font-heading mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {game.name}
          </h1>
        </div>
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
      ) : (
        <GamepassList
          gamepasses={gamepasses}
          gameId={game.id}
          gameSlug={game.slug}
          gameName={game.name}
          gameIconUrl={game.icon_url}
          orderingDisabled={storeStatus !== "open"}
        />
      )}
    </div>
  );
}
