import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { GameAvailabilityStatus } from "@/types/store-operations";

export interface CatalogLayoutGame {
  id: string;
  name: string;
  category: string | null;
  iconUrl: string | null;
  sortOrder: number;
  sourceSortOrder: number | null;
  isFeatured: boolean;
  featuredOrder: number | null;
  availabilityStatus: GameAvailabilityStatus;
}

export interface CatalogLayoutData {
  games: CatalogLayoutGame[];
  featuredGameLimit: number;
}

type PresentationRow = {
  game_id: string;
  sort_order: number;
  is_featured: boolean;
  featured_order: number | null;
};

const DEFAULT_FEATURED_GAME_LIMIT = 6;

function availabilityBucket(status: GameAvailabilityStatus) {
  return status === "available" ? 0 : 1;
}

export async function getCatalogLayoutData(): Promise<CatalogLayoutData> {
  const supabase = createAdminClient();

  const [gamesResult, presentationResult, settingsResult] = await Promise.all([
    supabase
      .from("games")
      .select("id, name, category, icon_url, sort_order, availability_status")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    supabase
      .from("store_game_presentation")
      .select("game_id, sort_order, is_featured, featured_order"),
    supabase
      .from("storefront_presentation_settings")
      .select("featured_game_limit")
      .eq("id", true)
      .maybeSingle(),
  ]);

  if (gamesResult.error) throw gamesResult.error;
  if (presentationResult.error) throw presentationResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const presentationByGameId = new Map(
    ((presentationResult.data ?? []) as PresentationRow[]).map((row) => [
      row.game_id,
      row,
    ]),
  );

  const maxManualOrder = Math.max(
    -1,
    ...Array.from(presentationByGameId.values()).map((row) => row.sort_order),
  );

  const games = (gamesResult.data ?? []).map((game, index) => {
    const presentation = presentationByGameId.get(game.id);
    return {
      id: game.id,
      name: game.name,
      category: game.category,
      iconUrl: game.icon_url,
      sortOrder:
        presentation?.sort_order ??
        maxManualOrder +
          1 +
          (game.sort_order ?? index),
      sourceSortOrder: game.sort_order,
      isFeatured: presentation?.is_featured ?? false,
      featuredOrder: presentation?.featured_order ?? null,
      availabilityStatus: game.availability_status,
    };
  });

  games.sort((a, b) => {
    const availabilityDelta =
      availabilityBucket(a.availabilityStatus) -
      availabilityBucket(b.availabilityStatus);
    if (availabilityDelta !== 0) return availabilityDelta;
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  });

  return {
    games,
    featuredGameLimit:
      settingsResult.data?.featured_game_limit ?? DEFAULT_FEATURED_GAME_LIMIT,
  };
}
