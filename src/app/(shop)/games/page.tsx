import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import { getGameProductCounts, getGamesAndPresentation } from "@/lib/queries/catalog";
import { GamesExplorer } from "@/components/catalog/games-explorer";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import { SupportHelpLink } from "@/components/ordering/support-help-link";
import { isRobuxViaLinkEnabled } from "@/lib/store-status";

export const metadata: Metadata = {
  title: "Browse games",
  description: "Browse every game BudgetWise supports.",
};

export const revalidate = 60;

export default async function GamesPage() {
  const [{ games }, productCounts, robuxViaLinkEnabled] = await Promise.all([
    getGamesAndPresentation(),
    getGameProductCounts(),
    isRobuxViaLinkEnabled(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 pt-4 pb-12 sm:pt-10 sm:pb-16">
      <OrderingProgress currentStep={1} className="sm:max-w-sm" />

      <h1 className="font-heading mt-4 text-2xl font-semibold tracking-tight sm:mt-6 sm:text-4xl">
        Pumili ng Game
      </h1>

      {games.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            icon={Gamepad2}
            title="No games yet"
            description="We're setting up the catalog. Check back shortly."
          />
        </div>
      ) : (
        <div className="mt-2 sm:mt-5">
          <GamesExplorer
            games={games}
            productCounts={productCounts}
            robuxViaLinkEnabled={robuxViaLinkEnabled}
          />
        </div>
      )}

      <div className="mt-4">
        <SupportHelpLink />
      </div>
    </div>
  );
}
