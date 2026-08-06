import { createPublicClient } from "@/lib/supabase/public";
import { featuredGamepasses, type ProductBadgeKind } from "@/config/merchandising";
import type { StoreGame, StoreGamepass } from "@/types/database";

export async function getGames(): Promise<StoreGame[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("store_games")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
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
