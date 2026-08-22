import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  GameAvailabilityStatus,
  ProductAvailabilityStatus,
} from "@/types/store-operations";

export interface AdminGame {
  id: string;
  name: string;
  category: string | null;
  availabilityStatus: GameAvailabilityStatus;
}

export interface AdminGamepass {
  id: string;
  gameId: string;
  name: string;
  canonicalName: string;
  displayName: string | null;
  isActive: boolean;
  availabilityStatus: ProductAvailabilityStatus;
}

function isMissingDisplayNameTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("store_product_display_names") === true
  );
}

// Unlike the customer-facing store_games / store_gamepasses views, these
// read every row regardless of hidden/inactive status — the admin panel is
// the one place "hidden" items still need to be visible and editable.
export async function getAllGamesForAdmin(): Promise<AdminGame[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, name, category, sort_order, availability_status")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((game) => ({
    id: game.id,
    name: game.name,
    category: game.category,
    availabilityStatus: game.availability_status,
  }));
}

export async function getAllGamepassesForAdmin(): Promise<AdminGamepass[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gamepasses")
    .select("id, game_id, name, is_active, availability_status")
    .order("name", { ascending: true });

  if (error) throw error;

  const gamepassIds = (data ?? []).map((gamepass) => gamepass.id);
  const { data: displayNames, error: displayNameError } = gamepassIds.length
    ? await supabase
        .from("store_product_display_names")
        .select("gamepass_id, display_name")
        .in("gamepass_id", gamepassIds)
    : { data: [], error: null };

  if (displayNameError && !isMissingDisplayNameTableError(displayNameError)) {
    throw displayNameError;
  }

  const displayNameByProductId = new Map(
    (displayNameError ? [] : (displayNames ?? [])).map((row) => [
      row.gamepass_id,
      row.display_name,
    ]),
  );

  return (data ?? []).map((gamepass) => {
    const displayName = displayNameByProductId.get(gamepass.id) ?? null;
    return {
      id: gamepass.id,
      gameId: gamepass.game_id,
      name: displayName ?? gamepass.name,
      canonicalName: gamepass.name,
      displayName,
      isActive: gamepass.is_active,
      availabilityStatus: gamepass.availability_status,
    };
  });
}
