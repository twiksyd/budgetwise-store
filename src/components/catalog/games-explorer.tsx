"use client";

import { useMemo, useState } from "react";
import { Search, Gamepad2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GameGrid } from "@/components/catalog/game-grid";
import { EmptyState } from "@/components/shared/empty-state";
import type { StoreGame } from "@/types/database";

export function GamesExplorer({ games }: { games: StoreGame[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games..."
            className="h-11 pl-10"
          />
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={category === null ? "default" : "outline"}
              onClick={() => setCategory(null)}
              className="rounded-full"
            >
              All
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={category === cat ? "default" : "outline"}
                onClick={() => setCategory(cat === category ? null : cat)}
                className="rounded-full"
              >
                {cat}
              </Button>
            ))}
          </div>
        )}
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
        <GameGrid games={filtered} />
      )}
    </div>
  );
}
