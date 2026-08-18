import { createPublicClient } from "@/lib/supabase/public";
import { featuredGamepasses, type ProductBadgeKind } from "@/config/merchandising";
import type { StoreGame, StoreGamepass } from "@/types/database";

const DEFAULT_FEATURED_GAME_LIMIT = 6;

export interface GamePresentationConfig {
  gameOrder: Map<string, number>;
  featuredOrder: Map<string, number>;
  featuredGameLimit: number;
  hasPresentationData: boolean;
  defaultOrderBase: number;
}

const emptyPresentationConfig: GamePresentationConfig = {
  gameOrder: new Map(),
  featuredOrder: new Map(),
  featuredGameLimit: DEFAULT_FEATURED_GAME_LIMIT,
  hasPresentationData: false,
  defaultOrderBase: 0,
};

function isAvailableGame(game: StoreGame) {
  return game.availability_status === "available";
}

function getAvailabilityBucket(game: StoreGame) {
  return isAvailableGame(game) ? 0 : 1;
}

function getPresentationSortOrder(
  game: StoreGame,
  presentation: GamePresentationConfig,
) {
  const manualOrder = presentation.gameOrder.get(game.id);
  if (manualOrder !== undefined) return manualOrder;

  if (presentation.hasPresentationData) {
    return presentation.defaultOrderBase + (game.sort_order ?? Number.MAX_SAFE_INTEGER);
  }

  return game.sort_order ?? Number.MAX_SAFE_INTEGER;
}

export function sortGamesForStorefront(
  games: StoreGame[],
  presentation: GamePresentationConfig,
) {
  return [...games].sort((a, b) => {
    const availabilityDelta = getAvailabilityBucket(a) - getAvailabilityBucket(b);
    if (availabilityDelta !== 0) return availabilityDelta;

    const aOrder = getPresentationSortOrder(a, presentation);
    const bOrder = getPresentationSortOrder(b, presentation);
    return aOrder - bOrder || a.name.localeCompare(b.name);
  });
}

export function getFeaturedStoreGames(
  games: StoreGame[],
  presentation: GamePresentationConfig,
) {
  if (!presentation.hasPresentationData) {
    return games
      .filter(isAvailableGame)
      .slice(0, presentation.featuredGameLimit);
  }

  return games
    .filter(
      (game) =>
        isAvailableGame(game) && presentation.featuredOrder.has(game.id),
    )
    .sort((a, b) => {
      const aOrder = presentation.featuredOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = presentation.featuredOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    })
    .slice(0, presentation.featuredGameLimit);
}

export async function getGamePresentationConfig(): Promise<GamePresentationConfig> {
  const supabase = createPublicClient();

  try {
    const [presentationResult, settingsResult] = await Promise.all([
      supabase
        .from("store_game_presentation")
        .select("game_id, sort_order, is_featured, featured_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("storefront_presentation_settings")
        .select("featured_game_limit")
        .eq("id", true)
        .maybeSingle(),
    ]);

    if (presentationResult.error || settingsResult.error) {
      return emptyPresentationConfig;
    }

    const maxManualOrder = Math.max(
      -1,
      ...(presentationResult.data ?? []).map((row) => row.sort_order),
    );

    return {
      gameOrder: new Map(
        (presentationResult.data ?? []).map((row) => [
          row.game_id,
          row.sort_order,
        ]),
      ),
      featuredOrder: new Map(
        (presentationResult.data ?? [])
          .filter((row) => row.is_featured && row.featured_order !== null)
          .map((row) => [row.game_id, row.featured_order as number]),
      ),
      featuredGameLimit:
        settingsResult.data?.featured_game_limit ?? DEFAULT_FEATURED_GAME_LIMIT,
      hasPresentationData: true,
      defaultOrderBase: maxManualOrder + 1,
    };
  } catch {
    return emptyPresentationConfig;
  }
}

export async function getGamesAndPresentation(): Promise<{
  games: StoreGame[];
  presentation: GamePresentationConfig;
}> {
  const supabase = createPublicClient();
  const [gamesResult, presentation] = await Promise.all([
    supabase.from("store_games").select("*").order("sort_order", { ascending: true }),
    getGamePresentationConfig(),
  ]);

  if (gamesResult.error) throw gamesResult.error;

  return {
    games: sortGamesForStorefront(gamesResult.data ?? [], presentation),
    presentation,
  };
}

export async function getGames(): Promise<StoreGame[]> {
  return (await getGamesAndPresentation()).games;
}

export async function getGameBySlug(slug: string): Promise<StoreGame | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("store_games")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface FeaturedGamepass {
  gamepass: StoreGamepass;
  game: StoreGame;
  badge: ProductBadgeKind;
}

// Powers the homepage "Featured Products" section — resolves each entry in
// config/merchandising.ts to its live gamepass row plus the game it belongs
// to (needed for cart metadata and linking back to the game page). Entries
// that are no longer active or don't exist are silently skipped rather than
// breaking the section.
export async function getFeaturedGamepasses(): Promise<FeaturedGamepass[]> {
  const ids = Object.keys(featuredGamepasses);
  if (ids.length === 0) return [];

  const supabase = createPublicClient();
  const { data: gamepasses, error } = await supabase
    .from("store_gamepasses")
    .select("*")
    .in("id", ids);

  if (error) throw error;
  if (!gamepasses || gamepasses.length === 0) return [];

  const gameIds = [...new Set(gamepasses.map((g) => g.game_id))];
  const { data: games, error: gamesError } = await supabase
    .from("store_games")
    .select("*")
    .in("id", gameIds);

  if (gamesError) throw gamesError;

  const gameById = new Map((games ?? []).map((g) => [g.id, g]));
  const gamepassById = new Map(gamepasses.map((g) => [g.id, g]));

  // .in() doesn't guarantee row order matches `ids`, so re-derive it from
  // the config's own key order to keep the section's display order
  // editable in one place.
  return ids
    .map((id) => {
      const gamepass = gamepassById.get(id);
      const game = gamepass && gameById.get(gamepass.game_id);
      const badge = featuredGamepasses[id];
      return gamepass && game && badge ? { gamepass, game, badge } : null;
    })
    .filter((entry): entry is FeaturedGamepass => entry !== null);
}

// Lightweight per-game product counts for catalog UI (card counts, the
// stats row) — one query for every game rather than N queries.
export async function getGameProductCounts(): Promise<Record<string, number>> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("store_gamepasses")
    .select("game_id");

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.game_id] = (counts[row.game_id] ?? 0) + 1;
  }
  return counts;
}

export async function getGamepassesByGameId(
  gameId: string,
): Promise<StoreGamepass[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("store_gamepasses")
    .select("*")
    .eq("game_id", gameId)
    .order("robux_amount", { ascending: true });

  if (error) throw error;
  return data;
}

// Official Roblox Game Pass artwork, pre-resolved and cached by
// scripts/sync-roblox-gamepasses.mjs — never fetched from Roblox at
// request time. Only returns entries with status "matched"; "no_match" and
// "ambiguous" rows exist in the cache table (so the sync script knows not
// to re-attempt them) but have no icon_url to show, so callers never see
// them here — they fall through to the existing placeholder treatment.
//
// Fail-safe by design: this is a nice-to-have visual enhancement, not
// load-bearing catalog data. If the cache table has an issue (or Roblox
// itself is what caused a "matched" row to go stale), the product page
// must still render normally with placeholders — never break the page.
export async function getRobloxIconCache(
  gamepassIds: string[],
): Promise<Map<string, string>> {
  if (gamepassIds.length === 0) return new Map();

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("roblox_gamepass_icon_cache")
      .select("gamepass_id, icon_url")
      .in("gamepass_id", gamepassIds)
      .eq("status", "matched");

    if (error) throw error;

    return new Map(
      (data ?? [])
        .filter((row): row is { gamepass_id: string; icon_url: string } =>
          Boolean(row.icon_url),
        )
        .map((row) => [row.gamepass_id, row.icon_url]),
    );
  } catch {
    return new Map();
  }
}
