"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CatalogLayoutActionResult {
  success: boolean;
  error?: string;
}

async function validateGameIds(gameIds: string[]) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    return "At least one game is required.";
  }

  if (gameIds.length > 500) {
    return "Too many games supplied.";
  }

  if (new Set(gameIds).size !== gameIds.length) {
    return "Duplicate games are not allowed.";
  }

  const invalidId = gameIds.find(
    (id) => typeof id !== "string" || !UUID_RE.test(id),
  );
  if (invalidId) {
    return `Invalid game ID: ${String(invalidId)}`;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("games")
    .select("id")
    .in("id", gameIds);

  if (error) return error.message;

  const existingIds = new Set((data ?? []).map((game) => game.id));
  const missingId = gameIds.find((id) => !existingIds.has(id));
  if (missingId) {
    return `Game is no longer in the catalog: ${missingId}`;
  }

  return null;
}

function revalidateCatalogLayout() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/catalog-layout");
}

export async function saveGameOrderAction(
  gameIds: string[],
): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError = await validateGameIds(gameIds);
  if (validationError) return { success: false, error: validationError };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_store_game_order", {
    p_game_ids: gameIds,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function saveFeaturedGamesAction(input: {
  featuredGameIds: string[];
  featuredGameLimit: number;
}): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError =
    input.featuredGameIds.length > 0
      ? await validateGameIds(input.featuredGameIds)
      : null;
  if (validationError) return { success: false, error: validationError };

  if (
    !Number.isInteger(input.featuredGameLimit) ||
    input.featuredGameLimit < 1 ||
    input.featuredGameLimit > 12
  ) {
    return {
      success: false,
      error: "Featured game count must be between 1 and 12.",
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_featured_games", {
    p_featured_game_ids: input.featuredGameIds,
    p_featured_game_limit: input.featuredGameLimit,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function resetGameOrderAction(): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("reset_store_game_order", {
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}
