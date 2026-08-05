import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import { getGames } from "@/lib/queries/catalog";
import { GameGrid } from "@/components/catalog/game-grid";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata: Metadata = {
  title: "Browse games",
  description: "Browse every game BudgetWise supports.",
};

export const revalidate = 60;

export default async function GamesPage() {
  const games = await getGames();

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Browse games
      </h1>
      <p className="text-muted-foreground mt-2">
        Pick a game to see its available currencies and gamepasses.
      </p>

      {games.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={Gamepad2}
            title="No games yet"
            description="We're setting up the catalog. Check back shortly."
          />
        </div>
      ) : (
        <GameGrid games={games} />
      )}
    </div>
  );
}
