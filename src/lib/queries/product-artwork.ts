import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProductArtworkSource = "manual" | "roblox" | "placeholder";

export interface ProductArtwork {
  url: string | null;
  source: ProductArtworkSource;
}

function isMissingArtworkTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.message?.includes("product_artwork_overrides") === true
  );
}

export async function getProductArtworkMap(
  gamepassIds: string[],
  options: { includeRoblox?: boolean } = {},
): Promise<Map<string, ProductArtwork>> {
  const ids = [...new Set(gamepassIds)].filter(Boolean);
  const artwork = new Map<string, ProductArtwork>();

  if (ids.length === 0) return artwork;

  const supabase = createAdminClient();
  const includeRoblox = options.includeRoblox ?? true;

  const overridePromise = supabase
    .from("product_artwork_overrides")
    .select("gamepass_id, source, icon_url")
    .in("gamepass_id", ids);
  const robloxPromise = includeRoblox
    ? supabase
        .from("roblox_gamepass_icon_cache")
        .select("gamepass_id, status, icon_url")
        .in("gamepass_id", ids)
        .eq("status", "matched")
    : Promise.resolve({ data: null, error: null });

  const [
    { data: overrides, error: overrideError },
    { data: robloxRows, error: robloxError },
  ] = await Promise.all([overridePromise, robloxPromise]);

  if (overrideError && !isMissingArtworkTableError(overrideError)) {
    throw overrideError;
  }

  for (const override of overrideError ? [] : (overrides ?? [])) {
    if (override.source === "manual" && override.icon_url) {
      artwork.set(override.gamepass_id, {
        source: "manual",
        url: override.icon_url,
      });
    } else if (override.source === "placeholder") {
      artwork.set(override.gamepass_id, {
        source: "placeholder",
        url: null,
      });
    }
  }

  if (robloxError) throw robloxError;

  if (includeRoblox) {
    for (const row of robloxRows ?? []) {
      if (row.icon_url && !artwork.has(row.gamepass_id)) {
        artwork.set(row.gamepass_id, {
          source: "roblox",
          url: row.icon_url,
        });
      }
    }
  }

  return artwork;
}

export function getProductArtworkUrlMap(
  artwork: Map<string, ProductArtwork>,
): Map<string, string> {
  return new Map(
    [...artwork.entries()]
      .filter((entry): entry is [string, ProductArtwork & { url: string }] =>
        Boolean(entry[1].url),
      )
      .map(([id, value]) => [id, value.url]),
  );
}
