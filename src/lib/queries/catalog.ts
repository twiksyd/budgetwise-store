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

  return gamepasses
    .map((gamepass) => {
      const game = gameById.get(gamepass.game_id);
      const badge = featuredGamepasses[gamepass.id];
      return game && badge ? { gamepass, game, badge } : null;
    })
    .filter((entry): entry is FeaturedGamepass => entry !== null);
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
