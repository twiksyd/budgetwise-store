import "server-only";
import type { ProductArtworkSource } from "@/lib/product-artwork-source";
import {
  getRobloxIdentity,
  getRobloxIdentitySafe,
  type RobloxIdentity,
} from "@/lib/queries/roblox-identity";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ProductArtwork {
  url: string | null;
  source: ProductArtworkSource;
}

export interface ProductArtworkLookupProduct {
  id: string;
  game_id: string;
  name: string;
}

function isMissingArtworkTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.message?.includes("product_artwork_overrides") === true
  );
}

function normalizeRobloxProductName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*(pass|gamepass)$/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function isProductInput(
  input: string | ProductArtworkLookupProduct,
): input is ProductArtworkLookupProduct {
  return typeof input !== "string";
}

export interface ProductArtworkOptions {
  includeRoblox?: boolean;
  // Verified Roblox identity for the universe-name fallback below. Omitted:
  // loaded strictly (a failure throws). null: identity is unavailable, so the
  // fallback is skipped while override and by-product cache artwork still apply.
  identity?: RobloxIdentity | null;
}

export async function getProductArtworkMap(
  productsOrIds: Array<string | ProductArtworkLookupProduct>,
  options: ProductArtworkOptions = {},
): Promise<Map<string, ProductArtwork>> {
  const ids = [
    ...new Set(
      productsOrIds
        .map((input) => (isProductInput(input) ? input.id : input))
        .filter(Boolean),
    ),
  ];
  const artwork = new Map<string, ProductArtwork>();

  if (ids.length === 0) return artwork;

  const supabase = createAdminClient();
  const includeRoblox = options.includeRoblox ?? true;
  const productMetadataById = new Map(
    productsOrIds
      .filter(isProductInput)
      .map((product) => [product.id, product]),
  );

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

    const idsMissingRobloxArtwork = ids.filter((id) => !artwork.has(id));
    const identity =
      idsMissingRobloxArtwork.length === 0
        ? null
        : options.identity !== undefined
          ? options.identity
          : await getRobloxIdentity();
    if (identity && idsMissingRobloxArtwork.length > 0) {
      const missingMetadataIds = idsMissingRobloxArtwork.filter(
        (id) => !productMetadataById.has(id),
      );

      if (missingMetadataIds.length > 0) {
        const { data: productRows, error: productRowsError } = await supabase
          .from("store_gamepasses")
          .select("id, game_id, name")
          .in("id", missingMetadataIds);

        if (productRowsError) throw productRowsError;
        for (const product of productRows ?? []) {
          productMetadataById.set(product.id, product);
        }
      }

      const productsMissingArtwork = idsMissingRobloxArtwork
        .map((id) => productMetadataById.get(id))
        .filter(
          (product): product is ProductArtworkLookupProduct =>
            product !== undefined && identity.isVerified(product.game_id),
        );
      const universeIds = [
        ...new Set(
          productsMissingArtwork.map(
            (product) => identity.getVerifiedUniverseId(product.game_id)!,
          ),
        ),
      ];

      if (universeIds.length > 0) {
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("roblox_gamepass_icon_cache")
          .select(
            "gamepass_id, roblox_universe_id, roblox_gamepass_id, icon_url, matched_name, last_verified_at",
          )
          .in("roblox_universe_id", universeIds)
          .eq("status", "matched")
          .not("icon_url", "is", null);

        if (fallbackError) throw fallbackError;

        const rowsByUniverseAndName = new Map<
          string,
          NonNullable<typeof fallbackRows>
        >();

        for (const row of fallbackRows ?? []) {
          if (!row.icon_url || !row.matched_name || row.roblox_gamepass_id === null) {
            continue;
          }
          const normalizedName = normalizeRobloxProductName(row.matched_name);
          if (!normalizedName) continue;
          const key = `${row.roblox_universe_id}:${normalizedName}`;
          const existing = rowsByUniverseAndName.get(key) ?? [];
          existing.push(row);
          rowsByUniverseAndName.set(key, existing);
        }

        for (const product of productsMissingArtwork) {
          if (artwork.has(product.id)) continue;

          const universeId = identity.getVerifiedUniverseId(product.game_id);
          const normalizedName = normalizeRobloxProductName(product.name);
          const candidates =
            rowsByUniverseAndName.get(`${universeId}:${normalizedName}`) ?? [];
          const distinctRobloxPassIds = new Set(
            candidates.map((candidate) => candidate.roblox_gamepass_id),
          );

          // XOB sometimes recreates product rows when prices change. If that
          // leaves a current product without cache by id, reuse an older cache
          // row only when the verified Roblox universe + pass name resolves to
          // exactly one Roblox Game Pass. Ambiguous names still fall through to
          // the normal placeholder instead of guessing.
          if (distinctRobloxPassIds.size !== 1) continue;

          const newestCandidate = [...candidates].sort((a, b) =>
            (b.last_verified_at ?? "").localeCompare(a.last_verified_at ?? ""),
          )[0];

          if (newestCandidate?.icon_url) {
            artwork.set(product.id, {
              source: "roblox",
              url: newestCandidate.icon_url,
            });
          }
        }
      }
    }
  }

  return artwork;
}

// Product artwork is a decorative Store enhancement, not purchasable data —
// a broken override table or a stale Roblox icon cache must never take down
// a game page. Callers that render customer-facing catalog pages should use
// this instead of getProductArtworkMap() directly; callers still exist that
// want a hard failure (e.g. the admin catalog layout editor).
export async function getProductArtworkMapSafe(
  productsOrIds: Array<string | ProductArtworkLookupProduct>,
  options: ProductArtworkOptions = {},
): Promise<Map<string, ProductArtwork>> {
  try {
    // An identity outage must not discard override and cache artwork, so
    // resolve it without throwing and pass null (skip the fallback) on failure.
    const identity =
      options.identity !== undefined || options.includeRoblox === false
        ? options.identity
        : (await getRobloxIdentitySafe()).identity;
    return await getProductArtworkMap(productsOrIds, { ...options, identity });
  } catch (error) {
    console.error("Failed to load product artwork", error);
    return new Map();
  }
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
