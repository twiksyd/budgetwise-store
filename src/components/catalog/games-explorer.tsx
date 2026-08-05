"use client";

import { useMemo, useState } from "react";
import { Search, Gamepad2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GameGrid } from "@/components/catalog/game-grid";
import { FeaturedGames } from "@/components/catalog/featured-games";
import { CatalogStats } from "@/components/catalog/catalog-stats";
import { EmptyState } from "@/components/shared/empty-state";
import { featuredGameIds } from "@/config/featured-games";
import type { StoreGame } from "@/types/database";

export function GamesExplorer({
  games,
  productCounts,
}: {
  games: StoreGame[];
  productCounts: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const featuredGames = useMemo(() => {
    const byId = new Map(games.map((g) => [g.id, g]));
    return featuredGameIds
      .map((id) => byId.get(id))
      .filter((g): g is StoreGame => g !== undefined);
  }, [games]);

  const categories = useMemo(() => {
    const unique = new Set(
      games.map((g) => g.category).filter((c): c is string => Boolean(c)),
    );
    return Array.from(unique).sort();
  }, [games]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return games.filter((game) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        game.name.toLowerCase().includes(normalizedQuery);
      const matchesCategory = !category || game.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [games, query, category]);

  return (
    <div>
      <CatalogStats
        gameCount={games.length}
        productCount={Object.values(productCounts).reduce((a, b) => a + b, 0)}
      />

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

      {filtered.length === 0 ? (
        <div className="mt-16">
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
