"use client";

import { useMemo, useState } from "react";
import { Search, Gamepad2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GameGrid } from "@/components/catalog/game-grid";
import { CatalogStats } from "@/components/catalog/catalog-stats";
import { EmptyState } from "@/components/shared/empty-state";
import {
  isRobuxPlusGame,
  robuxGameIds,
  robuxPlusPresentation,
} from "@/config/robux-products";
import { robuxViaLinkGameIds, robuxViaLinkTile } from "@/config/robux-via-link";
import { cn } from "@/lib/utils";
import type { StoreGame } from "@/types/database";

// Not a real `games` row — see config/robux-via-link.ts. Built once, outside
// the component, since it's a static tile with no dependency on live data
// (its product count is computed separately below, in `productCountsWithRobux`).
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

function searchableName(game: StoreGame) {
  return isRobuxPlusGame(game.id)
    ? `${robuxPlusPresentation.displayName} ${game.name}`
    : game.name;
}

// One catalog: search and category chips on top, every game card right
// under them. Robux options lead the "All" view as ordinary cards (they're
// the most-wanted products), instead of a separate promo block that pushed
// the games below the first screen.
export function GamesExplorer({
  games,
  productCounts,
  robuxViaLinkEnabled = true,
}: {
  games: StoreGame[];
  productCounts: Record<string, number>;
  robuxViaLinkEnabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  // The merged Via Link tile's count is the sum of its two source games'
  // live product counts (those games no longer render as their own cards).
  // Switched off in Store Operations: a zero count drops the card.
  const productCountsWithRobux = useMemo(
    () => ({
      ...productCounts,
      [robuxViaLinkGame.id]: robuxViaLinkEnabled
        ? (productCounts[robuxViaLinkGameIds.coveredTax] ?? 0) +
          (productCounts[robuxViaLinkGameIds.notCoveredTax] ?? 0)
        : 0,
    }),
    [productCounts, robuxViaLinkEnabled],
  );

  const robuxGames = useMemo(() => {
    const byId = new Map(games.map((g) => [g.id, g]));
    const configured = robuxGameIds
      .map((id) => byId.get(id))
      .filter((g): g is StoreGame => g !== undefined)
      .filter(
        (g) =>
          g.availability_status !== "available" ||
          (productCountsWithRobux[g.id] ?? 0) > 0,
      );
    const viaLink =
      (productCountsWithRobux[robuxViaLinkGame.id] ?? 0) > 0
        ? [robuxViaLinkGame]
        : [];
    return [...viaLink, ...configured];
  }, [games, productCountsWithRobux]);

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

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const matchesQuery = (game: StoreGame) =>
      normalizedQuery.length === 0 ||
      searchableName(game).toLowerCase().includes(normalizedQuery);

    const games = catalogGames.filter(
      (game) => matchesQuery(game) && (!category || game.category === category),
    );
    // Robux cards belong to no game category: they show in "All" only.
    const robux = category ? [] : robuxGames.filter(matchesQuery);
    const matches = [...robux, ...games];

    if (!normalizedQuery) return matches;

    const score = (game: StoreGame) => {
      const name = searchableName(game).toLowerCase();
      return name === normalizedQuery ? 0 : name.startsWith(normalizedQuery) ? 1 : 2;
    };
    return [...matches].sort((a, b) => score(a) - score(b));
  }, [catalogGames, robuxGames, normalizedQuery, category]);

  const isFiltering = normalizedQuery.length > 0 || category !== null;

  return (
    <div>
      {/* Sticky on phones so search and filters stay one thumb away while
          scrolling; kept to a single compact band (search + one chip row). */}
      <div className="bg-background/85 sticky top-16 z-30 -mx-6 px-6 pt-2 pb-2.5 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="games-search" className="sr-only">
              Search games
            </label>
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              id="games-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games"
              className="h-11 rounded-lg pr-10 pl-10 text-base sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {categories.length > 1 && (
            <div className="-mx-6 flex gap-1.5 overflow-x-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-end sm:px-0 [&::-webkit-scrollbar]:hidden">
              {[null, ...categories].map((cat) => {
                const active = category === cat;
                return (
                  <Button
                    key={cat ?? "all"}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    onClick={() => setCategory(cat === category ? null : cat)}
                    className={cn("h-9 shrink-0 rounded-lg px-4 transition-colors")}
                  >
                    {cat ?? "All"}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isFiltering && filtered.length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "game" : "games"}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Gamepad2}
            title="Walang nahanap"
            description="Try a different name or category."
          />
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
            >
              Ipakita lahat ng games
            </Button>
          </div>
        </div>
      ) : (
        <GameGrid
          games={filtered}
          productCounts={productCountsWithRobux}
          className="mt-3 sm:mt-8"
        />
      )}

      <div className="border-border/60 mt-12 border-t pt-5">
        <CatalogStats
          gameCount={catalogGames.length + robuxGames.length}
          productCount={Object.values(productCounts).reduce((a, b) => a + b, 0)}
        />
      </div>
    </div>
  );
}
