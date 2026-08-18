import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import {
  getFeaturedStoreGames,
  getGameProductCounts,
  getGamesAndPresentation,
} from "@/lib/queries/catalog";
import { GamesExplorer } from "@/components/catalog/games-explorer";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import { MessengerHelpLink } from "@/components/ordering/messenger-help-link";

export const metadata: Metadata = {
  title: "Browse games",
  description: "Browse every game BudgetWise supports.",
};

export const revalidate = 60;

export default async function GamesPage() {
  const [{ games, presentation }, productCounts] = await Promise.all([
    getGamesAndPresentation(),
    getGameProductCounts(),
  ]);
  const featuredGames = getFeaturedStoreGames(games, presentation);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-16">
      <OrderingProgress
        currentStep={1}
        description="Piliin po ang game na gusto ninyong bilhan."
      />

      <h1 className="font-heading mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
        Pumili ng Game
      </h1>
      <p className="text-muted-foreground mt-2 text-[15px]">
        Piliin po ang game para makita ang available items at gamepasses.
      </p>
      <div className="mt-3">
        <MessengerHelpLink />
      </div>

      {games.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            icon={Gamepad2}
            title="No games yet"
            description="We're setting up the catalog. Check back shortly."
          />
        </div>
      ) : (
        <div className="mt-6">
          <GamesExplorer
            games={games}
            featuredGames={featuredGames}
            productCounts={productCounts}
          />
        </div>
      )}
    </div>
  );
}
