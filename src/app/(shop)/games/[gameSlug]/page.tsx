import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { getGameBySlug, getGamepassesByGameId } from "@/lib/queries/catalog";
import { GamepassList } from "@/components/catalog/gamepass-list";
import { EmptyState } from "@/components/shared/empty-state";

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

  const gamepasses = await getGamepassesByGameId(game.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-muted-foreground text-sm">{game.category}</p>
      <h1 className="font-heading mt-1 text-3xl font-semibold tracking-tight">
        {game.name}
      </h1>

      {gamepasses.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={PackageSearch}
            title="No gamepasses available"
            description="This game doesn't have any active gamepasses right now. Check back soon."
          />
        </div>
      ) : (
        <GamepassList
          gamepasses={gamepasses}
          gameId={game.id}
          gameSlug={game.slug}
          gameName={game.name}
        />
      )}
    </div>
  );
}
