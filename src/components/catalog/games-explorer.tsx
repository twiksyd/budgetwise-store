"use client";

import { useMemo, useState } from "react";
import { Search, Gamepad2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GameGrid } from "@/components/catalog/game-grid";
import { FeaturedGames } from "@/components/catalog/featured-games";
import { RobuxSection } from "@/components/catalog/robux-section";
import { CatalogStats } from "@/components/catalog/catalog-stats";
import { EmptyState } from "@/components/shared/empty-state";
import { robuxGameIds } from "@/config/robux-products";
import { robuxViaLinkGameIds, robuxViaLinkTile } from "@/config/robux-via-link";
import type { StoreGame } from "@/types/database";

// Not a real `games` row — see config/robux-via-link.ts. Built once, outside
// the component, since it's a static tile with no dependency on live data
// (its product count is computed separately below, in `robuxProductCounts`).
const robuxViaLinkGame: StoreGame = {
  id: "robux-via-link",
  name: robuxViaLinkTile.name,
  slug: robuxViaLinkTile.slug,
  category: "Direct Sale",
  color: robuxViaLinkTile.color,
  icon_url: robuxViaLinkTile.iconUrl,
  sort_order: null,
  is_discounted: false,
  availability_status: "available",
};

export function GamesExplorer({
  games,
  featuredGames,
  productCounts,
}: {
  games: StoreGame[];
  featuredGames: StoreGame[];
  productCounts: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  // Robux top-ups aren't "a game" the way everything else in the catalog
  // is — pulled into their own section (always shown, unaffected by
  // search/category) so they don't dilute the regular games grid. The
  // merged "Robux (Via Link)" tile leads since it's the most commonly
  // wanted option; ROBUX PLUS (a distinct, separate product line) follows.
  const robuxGames = useMemo(() => {
    const byId = new Map(games.map((g) => [g.id, g]));
    const configured = robuxGameIds
      .map((id) => byId.get(id))
      .filter((g): g is StoreGame => g !== undefined);
    return [robuxViaLinkGame, ...configured];
  }, [games]);

  // The merged tile's count is the sum of its two source games' live
  // product counts — those ids still appear in `productCounts` (computed
  // from store_gamepasses, which doesn't care that the parent game is
  // hidden) even though the source games themselves no longer render as
  // their own cards.
  const robuxProductCounts = useMemo(
    () => ({
      ...productCounts,
      [robuxViaLinkGame.id]:
        (productCounts[robuxViaLinkGameIds.coveredTax] ?? 0) +
        (productCounts[robuxViaLinkGameIds.notCoveredTax] ?? 0),
    }),
    [productCounts],
  );

  const catalogGames = useMemo(
    () => games.filter((g) => !robuxGameIds.includes(g.id)),
    [games],
  );

  const categories = useMemo(() => {
    const unique = new Set(
      catalogGames.map((g) => g.category).filter((c): c is string => Boolean(c)),
    );
    return Array.from(unique).sort();
  }, [catalogGames]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = catalogGames.filter((game) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        game.name.toLowerCase().includes(normalizedQuery);
      const matchesCategory = !category || game.category === category;
      return matchesQuery && matchesCategory;
    });

    if (!normalizedQuery) return matches;

    return [...matches].sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aScore = aName === normalizedQuery ? 0 : aName.startsWith(normalizedQuery) ? 1 : 2;
      const bScore = bName === normalizedQuery ? 0 : bName.startsWith(normalizedQuery) ? 1 : 2;
      return aScore - bScore;
    });
  }, [catalogGames, query, category]);

  return (
    <div>
      <CatalogStats
        gameCount={games.length}
        productCount={Object.values(productCounts).reduce((a, b) => a + b, 0)}
      />

      {robuxGames.length > 0 && (
        <RobuxSection
          games={robuxGames}
          productCounts={robuxProductCounts}
          className="mt-8 sm:mt-10"
        />
      )}

      {featuredGames.length > 0 && (
        <div className="mt-8 sm:mt-10">
          <FeaturedGames games={featuredGames} productCounts={productCounts} />
        </div>
      )}

      <div className="sticky top-[72px] z-30 -mx-6 mt-8 bg-background/85 px-6 py-3 backdrop-blur-md sm:static sm:mx-0 sm:mt-12 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Roblox games..."
              className="h-11 rounded-full pl-10"
            />
          </div>

          {categories.length > 1 && (
            <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
              <Button
                size="sm"
                variant={category === null ? "default" : "outline"}
                onClick={() => setCategory(null)}
                className="shrink-0 rounded-full px-5 transition-all"
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat}
                  size="sm"
                  variant={category === cat ? "default" : "outline"}
                  onClick={() => setCategory(cat === category ? null : cat)}
                  className="shrink-0 rounded-full px-5 transition-all"
                >
                  {cat}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="font-heading mt-8 text-xl font-semibold tracking-tight sm:mt-12 sm:text-2xl">
        🎮 Games
      </h2>

      {filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Gamepad2}
            title="No games match"
            description="Try a different search term or category."
          />
        </div>
      ) : (
        <GameGrid games={filtered} productCounts={productCounts} />
      )}
    </div>
  );
}
