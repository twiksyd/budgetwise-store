import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductAvailabilityStatus } from "@/types/store-operations";

export type AdminArtworkSource =
  | "manual"
  | "roblox"
  | "placeholder"
  | "no_match"
  | "ambiguous";

export interface AdminProductAsset {
  id: string;
  name: string;
  gameId: string;
  gameName: string;
  gameCategory: string | null;
  isActive: boolean;
  availabilityStatus: ProductAvailabilityStatus;
  robuxAmount: number;
  price: number;
  artworkUrl: string | null;
  artworkSource: AdminArtworkSource;
  manualUrl: string | null;
  manualKind: "upload" | "remote" | null;
  manualStoragePath: string | null;
  robloxUrl: string | null;
  robloxStatus: "matched" | "no_match" | "ambiguous" | null;
  robloxMatchedName: string | null;
  robloxCandidateCount: number | null;
  updatedAt: string | null;
}

function isMissingArtworkTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.message?.includes("product_artwork_overrides") === true
  );
}

export async function getProductAssetsForAdmin(): Promise<AdminProductAsset[]> {
  const supabase = createAdminClient();

  const { data: gamepasses, error: gamepassError } = await supabase
    .from("gamepasses")
    .select(
      "id, game_id, name, robux_amount, your_price, is_active, availability_status",
    )
    .order("name", { ascending: true });

  if (gamepassError) throw gamepassError;

  const gameIds = [
    ...new Set((gamepasses ?? []).map((gamepass) => gamepass.game_id)),
  ];

  const gamepassIds = (gamepasses ?? []).map((gamepass) => gamepass.id);

  const [gamesResult, overridesResult, robloxResult] = await Promise.all([
    gameIds.length > 0
      ? supabase
          .from("games")
          .select("id, name, category, sort_order, availability_status")
          .in("id", gameIds)
      : Promise.resolve({ data: [], error: null }),
    gamepassIds.length > 0
      ? supabase
          .from("product_artwork_overrides")
          .select(
            "gamepass_id, source, manual_kind, icon_url, storage_path, original_url, updated_at",
          )
          .in("gamepass_id", gamepassIds)
      : Promise.resolve({ data: [], error: null }),
    gamepassIds.length > 0
      ? supabase
          .from("roblox_gamepass_icon_cache")
          .select(
            "gamepass_id, status, icon_url, matched_name, candidate_count, last_verified_at",
          )
          .in("gamepass_id", gamepassIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (gamesResult.error) throw gamesResult.error;
  if (
    overridesResult.error &&
    !isMissingArtworkTableError(overridesResult.error)
  ) {
    throw overridesResult.error;
  }
  if (robloxResult.error) throw robloxResult.error;

  const gameById = new Map(
    (gamesResult.data ?? []).map((game) => [game.id, game]),
  );
  const overrideByProductId = new Map(
    (overridesResult.error ? [] : (overridesResult.data ?? [])).map(
      (override) => [override.gamepass_id, override],
    ),
  );
  const robloxByProductId = new Map(
    (robloxResult.data ?? []).map((row) => [row.gamepass_id, row]),
  );

  return (gamepasses ?? [])
    .map((gamepass) => {
      const game = gameById.get(gamepass.game_id);
      const override = overrideByProductId.get(gamepass.id);
      const roblox = robloxByProductId.get(gamepass.id);

      let artworkSource: AdminArtworkSource = "placeholder";
      let artworkUrl: string | null = null;

      if (override?.source === "manual" && override.icon_url) {
        artworkSource = "manual";
        artworkUrl = override.icon_url;
      } else if (override?.source === "placeholder") {
        artworkSource = "placeholder";
      } else if (roblox?.status === "matched" && roblox.icon_url) {
        artworkSource = "roblox";
        artworkUrl = roblox.icon_url;
      } else if (roblox?.status === "ambiguous") {
        artworkSource = "ambiguous";
      } else if (roblox?.status === "no_match") {
        artworkSource = "no_match";
      }

      return {
        id: gamepass.id,
        name: gamepass.name,
        gameId: gamepass.game_id,
        gameName: game?.name ?? "Unknown game",
        gameCategory: game?.category ?? null,
        isActive: gamepass.is_active,
        availabilityStatus: gamepass.availability_status,
        robuxAmount: gamepass.robux_amount,
        price: gamepass.your_price,
        artworkUrl,
        artworkSource,
        manualUrl: override?.source === "manual" ? override.icon_url : null,
        manualKind: override?.source === "manual" ? override.manual_kind : null,
        manualStoragePath: override?.storage_path ?? null,
        robloxUrl: roblox?.status === "matched" ? roblox.icon_url : null,
        robloxStatus: roblox?.status ?? null,
        robloxMatchedName: roblox?.matched_name ?? null,
        robloxCandidateCount: roblox?.candidate_count ?? null,
        updatedAt: override?.updated_at ?? roblox?.last_verified_at ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.gameName.localeCompare(b.gameName) || a.name.localeCompare(b.name),
    );
}
