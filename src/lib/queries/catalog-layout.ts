import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getProductArtworkMap,
} from "@/lib/queries/product-artwork";
import type { ProductArtworkSource } from "@/lib/product-artwork-source";
import { getProductCardBackgroundUrlMap } from "@/lib/queries/product-card-backgrounds";
import {
  getDefaultProductCardAccentSettings,
  getProductCardAccentSettingsMap,
} from "@/lib/queries/product-card-accent-settings";
import type { ProductCardAccentSettingsWithMeta } from "@/lib/product-card-accent";
import { robloxUniverseIds } from "@/config/roblox-universe-ids";
import type { GameAvailabilityStatus } from "@/types/store-operations";
import type { ProductAvailabilityStatus } from "@/types/store-operations";

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
  productLayout: CatalogProductLayoutData;
}

export interface CatalogProductLayoutSection {
  id: string;
  gameId: string;
  name: string;
  sortOrder: number;
}

export interface CatalogProductLayoutProduct {
  id: string;
  gameId: string;
  name: string;
  displayName: string | null;
  robuxAmount: number;
  price: number;
  availabilityStatus: ProductAvailabilityStatus;
  sectionId: string | null;
  sortOrder: number;
  artworkUrl: string | null;
  artworkSource: ProductArtworkSource | null;
  cardBackgroundUrl: string | null;
}

export interface CatalogProductLayoutGame {
  gameId: string;
  sections: CatalogProductLayoutSection[];
  products: CatalogProductLayoutProduct[];
  hasCustomLayout: boolean;
  accentSettings: ProductCardAccentSettingsWithMeta;
}

export interface CatalogProductLayoutData {
  games: CatalogProductLayoutGame[];
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

function isMissingProductLayoutTableError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("store_product_sections") === true ||
    error.message?.includes("store_product_presentation") === true ||
    error.message?.includes("store_product_display_names") === true
  );
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

  const productLayout = await getCatalogProductLayoutData(
    games.map((game) => game.id),
  );

  return {
    games,
    featuredGameLimit:
      settingsResult.data?.featured_game_limit ?? DEFAULT_FEATURED_GAME_LIMIT,
    productLayout,
  };
}

async function getCatalogProductLayoutData(
  gameIds: string[],
): Promise<CatalogProductLayoutData> {
  if (gameIds.length === 0) return { games: [] };

  const supabase = createAdminClient();
  const [
    productsResult,
    sectionsResult,
    presentationResult,
    displayNamesResult,
  ] = await Promise.all([
    supabase
      .from("store_gamepasses")
      .select("id, game_id, name, robux_amount, price, availability_status")
      .in("game_id", gameIds)
      .order("robux_amount", { ascending: true }),
    supabase
      .from("store_product_sections")
      .select("id, game_id, name, sort_order")
      .in("game_id", gameIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("store_product_presentation")
      .select("gamepass_id, game_id, section_id, sort_order")
      .in("game_id", gameIds),
    supabase
      .from("store_product_display_names")
      .select("gamepass_id, display_name")
      .in("game_id", gameIds),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (sectionsResult.error || presentationResult.error) {
    const error = sectionsResult.error ?? presentationResult.error;
    if (!error || !isMissingProductLayoutTableError(error)) {
      throw error;
    }
  }
  if (
    displayNamesResult.error &&
    !isMissingProductLayoutTableError(displayNamesResult.error)
  ) {
    throw displayNamesResult.error;
  }

  const productRows = productsResult.data ?? [];
  const displayNameByProductId = new Map(
    (displayNamesResult.error ? [] : (displayNamesResult.data ?? [])).map(
      (row) => [row.gamepass_id, row.display_name],
    ),
  );
  const productArtwork = await getProductArtworkMap(productRows, {
    includeRoblox: productRows.some((product) =>
      Boolean(robloxUniverseIds[product.game_id]),
    ),
  });
  const [cardBackgroundUrls, accentSettings] = await Promise.all([
    getProductCardBackgroundUrlMap(productRows.map((product) => product.id)),
    getProductCardAccentSettingsMap(gameIds),
  ]);

  const sectionsByGameId = new Map<string, CatalogProductLayoutSection[]>();
  for (const section of sectionsResult.error ? [] : (sectionsResult.data ?? [])) {
    const list = sectionsByGameId.get(section.game_id) ?? [];
    list.push({
      id: section.id,
      gameId: section.game_id,
      name: section.name,
      sortOrder: section.sort_order,
    });
    sectionsByGameId.set(section.game_id, list);
  }

  const presentationByProductId = new Map(
    (presentationResult.error ? [] : (presentationResult.data ?? [])).map((row) => [
      row.gamepass_id,
      row,
    ]),
  );

  const maxSortOrderByGameId = new Map<string, number>();
  for (const row of presentationResult.error ? [] : (presentationResult.data ?? [])) {
    maxSortOrderByGameId.set(
      row.game_id,
      Math.max(maxSortOrderByGameId.get(row.game_id) ?? -1, row.sort_order),
    );
  }

  const productsByGameId = new Map<string, CatalogProductLayoutProduct[]>();
  for (const [fallbackIndex, product] of productRows.entries()) {
    const presentation = presentationByProductId.get(product.id);
    const list = productsByGameId.get(product.game_id) ?? [];
    list.push({
      id: product.id,
      gameId: product.game_id,
      name: product.name,
      displayName: displayNameByProductId.get(product.id) ?? null,
      robuxAmount: product.robux_amount,
      price: product.price,
      availabilityStatus: product.availability_status,
      sectionId: presentation?.section_id ?? null,
      sortOrder:
        presentation?.sort_order ??
        (maxSortOrderByGameId.get(product.game_id) ?? -1) + fallbackIndex + 1,
      artworkUrl: productArtwork.get(product.id)?.url ?? null,
      artworkSource: productArtwork.get(product.id)?.source ?? null,
      cardBackgroundUrl: cardBackgroundUrls.get(product.id) ?? null,
    });
    productsByGameId.set(product.game_id, list);
  }

  return {
    games: gameIds.map((gameId) => {
      const sections = sectionsByGameId.get(gameId) ?? [];
      const products = productsByGameId.get(gameId) ?? [];
      return {
        gameId,
        sections: sections.sort((a, b) => a.sortOrder - b.sortOrder),
        products: products.sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.robuxAmount - b.robuxAmount ||
            a.name.localeCompare(b.name),
        ),
        hasCustomLayout:
          sections.length > 0 ||
          products.some((product) => presentationByProductId.has(product.id)),
        accentSettings:
          accentSettings.get(gameId) ?? getDefaultProductCardAccentSettings(),
      };
    }),
  };
}
