import { createPublicClient } from "@/lib/supabase/public";
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
