"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  RotateCcw,
  Save,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  resetGameOrderAction,
  saveFeaturedGamesAction,
  saveGameOrderAction,
} from "@/app/admin/(protected)/catalog-layout/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CatalogLayoutGame,
  CatalogProductLayoutData,
} from "@/lib/queries/catalog-layout";
import { GAME_AVAILABILITY_LABELS } from "@/types/store-operations";
import { ProductLayoutManager } from "@/components/admin/product-layout-manager";

const FEATURED_LIMITS = [1, 2, 3, 4, 6, 8, 10, 12];

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function sameIds(a: CatalogLayoutGame[], b: CatalogLayoutGame[]) {
  return a.length === b.length && a.every((item, index) => item.id === b[index]?.id);
}

function sameStringArray(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function statusTone(status: CatalogLayoutGame["availabilityStatus"]) {
  if (status === "available") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "hidden") return "bg-muted text-muted-foreground";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function GameThumb({ game }: { game: CatalogLayoutGame }) {
  return (
    <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-lg">
      {game.iconUrl ? (
        <Image
          src={game.iconUrl}
          alt=""
          fill
          sizes="40px"
          className="object-cover"
        />
      ) : (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center text-xs font-semibold">
          {game.name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function GameRow({
  game,
  index,
  total,
  isFeatured,
  disabled,
  onMove,
  onDragStart,
  onDrop,
  action,
}: {
  game: CatalogLayoutGame;
  index: number;
  total: number;
  isFeatured: boolean;
  disabled: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={() => onDragStart(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(index)}
      className="grid gap-3 border-b p-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <GripVertical className="text-muted-foreground size-4 shrink-0 cursor-grab" />
        <GameThumb game={game} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{game.name}</p>
            {isFeatured && (
              <Badge className="h-5 gap-1">
                <Star className="size-3" />
                Featured
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="ghost"
              className={cn("h-5", statusTone(game.availabilityStatus))}
            >
              {GAME_AVAILABILITY_LABELS[game.availabilityStatus]}
            </Badge>
            {game.category && (
              <span className="text-muted-foreground text-xs">
                {game.category}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Move ${game.name} up`}
            disabled={disabled || index === 0}
            onClick={() => onMove(index, index - 1)}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Move ${game.name} down`}
            disabled={disabled || index === total - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <ArrowDown className="size-3.5" />
          </Button>
        </div>
        {action}
      </div>
    </div>
  );
}

export function CatalogLayoutManager({
  games,
  featuredGameLimit,
  productLayout,
}: {
  games: CatalogLayoutGame[];
  featuredGameLimit: number;
  productLayout: CatalogProductLayoutData;
}) {
  const [gameOrder, setGameOrder] = useState(games);
  const [savedGameOrder, setSavedGameOrder] = useState(games);
  const [featuredIds, setFeaturedIds] = useState(() =>
    games
      .filter((game) => game.isFeatured)
      .sort(
        (a, b) =>
          (a.featuredOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.featuredOrder ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name),
      )
      .map((game) => game.id),
  );
  const [savedFeaturedIds, setSavedFeaturedIds] = useState(featuredIds);
  const [limit, setLimit] = useState(featuredGameLimit);
  const [savedLimit, setSavedLimit] = useState(featuredGameLimit);
  const [query, setQuery] = useState("");
  const [selectedFeaturedGameId, setSelectedFeaturedGameId] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [featuredDragIndex, setFeaturedDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const gameById = useMemo(
    () => new Map(games.map((game) => [game.id, game])),
    [games],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGameOrder = useMemo(() => {
    if (!normalizedQuery) return gameOrder;
    return gameOrder.filter((game) =>
      game.name.toLowerCase().includes(normalizedQuery),
    );
  }, [gameOrder, normalizedQuery]);

  const featuredGames = featuredIds
    .map((id) => gameById.get(id))
    .filter((game): game is CatalogLayoutGame => Boolean(game));

  const addableGames = gameOrder.filter((game) => !featuredIds.includes(game.id));
  const availableFeaturedCount = featuredGames.filter(
    (game) => game.availabilityStatus === "available",
  ).length;

  const gameOrderDirty = !sameIds(gameOrder, savedGameOrder);
  const featuredDirty =
    !sameStringArray(featuredIds, savedFeaturedIds) || limit !== savedLimit;

  function moveGame(fromIndex: number, toIndex: number) {
    setGameOrder((current) => moveItem(current, fromIndex, toIndex));
  }

  function moveVisibleGame(fromVisibleIndex: number, toVisibleIndex: number) {
    const fromGame = visibleGameOrder[fromVisibleIndex];
    const toGame = visibleGameOrder[toVisibleIndex];
    if (!fromGame || !toGame) return;
    const fromIndex = gameOrder.findIndex((game) => game.id === fromGame.id);
    const toIndex = gameOrder.findIndex((game) => game.id === toGame.id);
    moveGame(fromIndex, toIndex);
  }

  function saveGameOrder() {
    startTransition(async () => {
      const result = await saveGameOrderAction(gameOrder.map((game) => game.id));
      if (result.success) {
        setSavedGameOrder(gameOrder);
        toast.success("Game order saved.");
      } else {
        toast.error(result.error ?? "Game order was not saved.");
      }
    });
  }

  function resetGameOrder() {
    if (!window.confirm("Reset game order to the default catalog order?")) return;

    startTransition(async () => {
      const result = await resetGameOrderAction();
      if (result.success) {
        const reset = [...games].sort(
          (a, b) =>
            (a.availabilityStatus === "available" ? 0 : 1) -
              (b.availabilityStatus === "available" ? 0 : 1) ||
            (a.sourceSortOrder ?? Number.MAX_SAFE_INTEGER) -
              (b.sourceSortOrder ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name),
        );
        setGameOrder(reset);
        setSavedGameOrder(reset);
        toast.success("Game order reset.");
      } else {
        toast.error(result.error ?? "Game order was not reset.");
      }
    });
  }

  function saveFeaturedGames() {
    startTransition(async () => {
      const result = await saveFeaturedGamesAction({
        featuredGameIds: featuredIds,
        featuredGameLimit: limit,
      });
      if (result.success) {
        setSavedFeaturedIds(featuredIds);
        setSavedLimit(limit);
        toast.success("Featured games saved.");
      } else {
        toast.error(result.error ?? "Featured games were not saved.");
      }
    });
  }

  return (
    <div className="grid gap-8">
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Game Order
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Available games appear first on the storefront. Manual order is
              preserved when a game becomes unavailable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={resetGameOrder}
            >
              <RotateCcw className="size-3.5" />
              Reset Order
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || !gameOrderDirty}
              onClick={saveGameOrder}
            >
              <Save className="size-3.5" />
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        <div className="relative mt-4 max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search games"
            className="h-10 pl-9"
          />
        </div>

        <div className="surface-premium mt-4 overflow-hidden rounded-2xl">
          {visibleGameOrder.map((game, index) => (
            <GameRow
              key={game.id}
              game={game}
              index={index}
              total={visibleGameOrder.length}
              isFeatured={featuredIds.includes(game.id)}
              disabled={pending}
              onMove={moveVisibleGame}
              onDragStart={setDragIndex}
              onDrop={(dropIndex) => {
                if (dragIndex === null) return;
                moveVisibleGame(dragIndex, dropIndex);
                setDragIndex(null);
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Featured Games
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Unavailable games stay configured here, but they do not take a
              visible Featured slot.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending || !featuredDirty}
            onClick={saveFeaturedGames}
          >
            <Save className="size-3.5" />
            {pending ? "Saving..." : "Save Featured"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-medium">
            <span>Number of Featured Games</span>
            <select
              value={limit}
              disabled={pending}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="border-input bg-background h-10 rounded-lg border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {FEATURED_LIMITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <p className="text-muted-foreground text-xs">
            {availableFeaturedCount} available Featured game
            {availableFeaturedCount === 1 ? "" : "s"} configured.
          </p>
        </div>

        {addableGames.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,22rem)_auto]">
            <select
              value={selectedFeaturedGameId}
              disabled={pending}
              onChange={(event) => setSelectedFeaturedGameId(event.target.value)}
              className="border-input bg-background h-10 min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Choose a game to feature</option>
              {addableGames.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !selectedFeaturedGameId}
              onClick={() => {
                setFeaturedIds((current) => [
                  ...current,
                  selectedFeaturedGameId,
                ]);
                setSelectedFeaturedGameId("");
              }}
            >
              <Star className="size-3.5" />
              Add to Featured
            </Button>
          </div>
        )}

        <div className="surface-premium mt-4 overflow-hidden rounded-2xl">
          {featuredGames.length > 0 ? (
            featuredGames.map((game, index) => (
              <GameRow
                key={game.id}
                game={game}
                index={index}
                total={featuredGames.length}
                isFeatured
                disabled={pending}
                onMove={(fromIndex, toIndex) =>
                  setFeaturedIds((current) =>
                    moveItem(current, fromIndex, toIndex),
                  )
                }
                onDragStart={setFeaturedDragIndex}
                onDrop={(dropIndex) => {
                  if (featuredDragIndex === null) return;
                  setFeaturedIds((current) =>
                    moveItem(current, featuredDragIndex, dropIndex),
                  );
                  setFeaturedDragIndex(null);
                }}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      setFeaturedIds((current) =>
                        current.filter((id) => id !== game.id),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </Button>
                }
              />
            ))
          ) : (
            <div className="p-8 text-center">
              <p className="font-heading text-sm font-semibold">
                No Featured games yet.
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Add games above, then save the Featured order.
              </p>
            </div>
          )}
        </div>
      </section>

      <ProductLayoutManager games={games} productLayout={productLayout} />
    </div>
  );
}
