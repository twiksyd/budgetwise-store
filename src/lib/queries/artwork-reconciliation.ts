import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Recovery tool for the failure mode discovered 2026-08-18: XOB re-imports
// public.gamepasses by inserting fresh rows with new ids instead of updating
// existing ones in place, which silently orphans any product_artwork_overrides
// row still pointing at the old id (see migration 0011). This surfaces those
// orphans and, where the override has a name/game snapshot to match against,
// suggests the replacement row so an admin can relink instead of re-uploading.

export interface ArtworkReconciliationCandidate {
  gamepassId: string;
  name: string;
  gameId: string;
  gameName: string;
}

export interface OrphanedArtworkOverride {
  oldGamepassId: string;
  source: "manual" | "placeholder";
  manualKind: "upload" | "remote" | null;
  iconUrl: string | null;
  storagePath: string | null;
  updatedAt: string;
  productName: string | null;
  gameName: string | null;
  candidates: ArtworkReconciliationCandidate[];
  matchType: "exact-one" | "multiple" | "none" | "no-snapshot";
}

export interface ArtworkReconciliationData {
  orphans: OrphanedArtworkOverride[];
  allProducts: ArtworkReconciliationCandidate[];
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getArtworkReconciliationData(): Promise<ArtworkReconciliationData> {
  const supabase = createAdminClient();

  const [overridesResult, gamepassesResult, gamesResult] = await Promise.all([
    supabase
      .from("product_artwork_overrides")
      .select(
        "gamepass_id, source, manual_kind, icon_url, storage_path, updated_at, product_name, game_id",
      ),
    supabase.from("gamepasses").select("id, name, game_id"),
    supabase.from("games").select("id, name"),
  ]);

  if (overridesResult.error) throw overridesResult.error;
  if (gamepassesResult.error) throw gamepassesResult.error;
  if (gamesResult.error) throw gamesResult.error;

  const overrides = overridesResult.data ?? [];
  const gamepasses = gamepassesResult.data ?? [];
  const games = gamesResult.data ?? [];

  const gameNameById = new Map(games.map((game) => [game.id, game.name]));
  const currentGamepassIds = new Set(gamepasses.map((gp) => gp.id));

  const allProducts: ArtworkReconciliationCandidate[] = gamepasses.map((gp) => ({
    gamepassId: gp.id,
    name: gp.name,
    gameId: gp.game_id,
    gameName: gameNameById.get(gp.game_id) ?? "Unknown game",
  }));

  const gamepassesByNormalizedName = new Map<string, typeof gamepasses>();
  for (const gp of gamepasses) {
    const norm = normalizeName(gp.name);
    const list = gamepassesByNormalizedName.get(norm) ?? [];
    list.push(gp);
    gamepassesByNormalizedName.set(norm, list);
  }

  const orphans: OrphanedArtworkOverride[] = [];

  for (const override of overrides) {
    if (currentGamepassIds.has(override.gamepass_id)) continue;

    let candidates: ArtworkReconciliationCandidate[] = [];
    let matchType: OrphanedArtworkOverride["matchType"] = "no-snapshot";

    if (override.product_name) {
      const norm = normalizeName(override.product_name);
      const sameNameMatches = gamepassesByNormalizedName.get(norm) ?? [];

      // Prefer matches within the product's original game (games are far
      // more stable than gamepasses — see migration 0011's comment); only
      // fall back to a cross-game name match if nothing scored there.
      const scoped = override.game_id
        ? sameNameMatches.filter((gp) => gp.game_id === override.game_id)
        : [];

      const pool = scoped.length > 0 ? scoped : sameNameMatches;
      candidates = pool.map((gp) => ({
        gamepassId: gp.id,
        name: gp.name,
        gameId: gp.game_id,
        gameName: gameNameById.get(gp.game_id) ?? "Unknown game",
      }));

      matchType =
        candidates.length === 1
          ? "exact-one"
          : candidates.length > 1
            ? "multiple"
            : "none";
    }

    orphans.push({
      oldGamepassId: override.gamepass_id,
      source: override.source,
      manualKind: override.manual_kind,
      iconUrl: override.icon_url,
      storagePath: override.storage_path,
      updatedAt: override.updated_at,
      productName: override.product_name,
      gameName: override.game_id
        ? (gameNameById.get(override.game_id) ?? "Unknown game")
        : null,
      candidates,
      matchType,
    });
  }

  orphans.sort((a, b) => (a.productName ?? "").localeCompare(b.productName ?? ""));

  return { orphans, allProducts };
}
