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
  isActive: boolean;
  availabilityStatus: ProductAvailabilityStatus;
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

  return (data ?? []).map((gamepass) => ({
    id: gamepass.id,
    gameId: gamepass.game_id,
    name: gamepass.name,
    isActive: gamepass.is_active,
    availabilityStatus: gamepass.availability_status,
  }));
}
