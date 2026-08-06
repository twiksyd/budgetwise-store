import "server-only";

import universeIdsConfig from "@/config/roblox-universe-ids.json";
import {
  isRobuxViaLinkSourceGame,
  robuxViaLinkGameIds,
} from "@/config/robux-via-link";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  GameAvailabilityStatus,
  ProductAvailabilityStatus,
} from "@/types/store-operations";

export type CatalogHealthSeverity =
  | "critical"
  | "warning"
  | "information"
  | "healthy";

export type CatalogHealthArtworkSource =
  | "manual_override"
  | "roblox_cache"
  | "forced_placeholder"
  | "normal_placeholder"
  | "broken_manual_override"
  | "broken_roblox_cache"
  | "not_available";

export type CatalogHealthMatchStatus =
  | "matched"
  | "no_match"
  | "ambiguous"
  | "no_sync_record"
  | "not_available";

export type CatalogHealthConfigStatus =
  | "configured"
  | "not_configured"
  | "special_store_route"
  | "not_available";

export interface CatalogHealthMetric {
  id: string;
  label: string;
  value: number | null;
  help?: string;
  unavailableReason?: string;
}

export interface CatalogHealthIssue {
  id: string;
  severity: Exclude<CatalogHealthSeverity, "healthy">;
  type: string;
  gameId: string | null;
  gameName: string | null;
  gameAvailability: GameAvailabilityStatus | "missing" | "not_available";
  productId: string | null;
  productName: string | null;
  productAvailability:
    | ProductAvailabilityStatus
    | "inactive"
    | "missing"
    | "not_available";
  artworkSource: CatalogHealthArtworkSource;
  robloxMatchStatus: CatalogHealthMatchStatus;
  configurationStatus: CatalogHealthConfigStatus;
  currentState: string;
  whyItMatters: string;
  recommendedAction: string;
  relatedLinks: Array<{ label: string; href: string }>;
  detectedAt: string | null;
}

export interface CatalogHealthGameCoverage {
  gameId: string;
  gameName: string;
  slug: string | null;
  rawAvailability: GameAvailabilityStatus;
  storefrontAvailability: GameAvailabilityStatus | "not_visible";
  rawProductCount: number;
  storefrontProductCount: number;
  availableProductCount: number;
  thumbnailPresent: boolean;
  configurationStatus: CatalogHealthConfigStatus;
  universeId: number | null;
  latestSyncAt: string | null;
  publicHref: string | null;
}

export interface CatalogHealthProduct {
  productId: string;
  productName: string;
  gameId: string;
  gameName: string;
  rawAvailability: ProductAvailabilityStatus;
  isActive: boolean;
  storefrontVisible: boolean;
  storefrontAvailability: ProductAvailabilityStatus | "not_visible";
  parentGameAvailability: GameAvailabilityStatus | "missing";
  price: number | null;
  robuxAmount: number | null;
  artworkSource: CatalogHealthArtworkSource;
  artworkUrlPresent: boolean;
  robloxMatchStatus: CatalogHealthMatchStatus;
  configurationStatus: CatalogHealthConfigStatus;
  issueCount: number;
  publicHref: string | null;
}

export interface CatalogHealthOrphan {
  id: string;
  recordType: "roblox_cache" | "artwork_override";
  recordId: string;
  currentState: string;
  recommendedAction: string;
  detectedAt: string | null;
}

export interface CatalogHealthDuplicateGroup {
  id: string;
  recordType: "game" | "product";
  normalizedName: string;
  names: string[];
  gameId: string | null;
  gameName: string | null;
  records: Array<{
    id: string;
    name: string;
    availability: string;
  }>;
}

export interface CatalogHealthSourceStatus {
  source: string;
  ok: boolean;
  message: string | null;
}

export interface CatalogHealthData {
  summary: CatalogHealthMetric[];
  issues: CatalogHealthIssue[];
  priorityIssues: CatalogHealthIssue[];
  gameCoverage: CatalogHealthGameCoverage[];
  productHealth: CatalogHealthProduct[];
  orphanedRecords: CatalogHealthOrphan[];
  duplicateGroups: CatalogHealthDuplicateGroup[];
  sourceStatus: CatalogHealthSourceStatus[];
  filters: {
    games: Array<{ id: string; name: string }>;
    issueTypes: string[];
  };
  rules: {
    storefrontVisibility: string[];
    priceValidation: string[];
    artworkFallback: string[];
    orphanDetection: string[];
    duplicateDetection: string[];
  };
}

type RawGame = {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
  icon_url: string | null;
  sort_order: number | null;
  is_discounted: boolean | null;
  availability_status: GameAvailabilityStatus;
};

type RawGamepass = {
  id: string;
  game_id: string;
  name: string;
  robux_amount: number | null;
  your_price: number | null;
  is_active: boolean;
  availability_status: ProductAvailabilityStatus;
};

type StoreGameRow = {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  availability_status: GameAvailabilityStatus;
};

type StoreGamepassRow = {
  id: string;
  game_id: string;
  name: string;
  robux_amount: number | null;
  price: number | null;
  availability_status: ProductAvailabilityStatus;
};

type CacheRow = {
  gamepass_id: string;
  roblox_universe_id: number;
  status: "matched" | "no_match" | "ambiguous";
  icon_url: string | null;
  matched_name: string | null;
  candidate_count: number;
  synced_at: string;
  last_verified_at: string | null;
  first_flagged_at: string | null;
};

type OverrideRow = {
  gamepass_id: string;
  source: "manual" | "placeholder";
  manual_kind: "upload" | "remote" | null;
  icon_url: string | null;
  storage_path: string | null;
  original_url: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  updated_at: string;
};

type QueryResult<T> = {
  source: string;
  data: T[];
  error: string | null;
};

const PRICE_LIMIT = 1_000_000;
const robuxViaLinkSourceGameIds = new Set<string>([
  robuxViaLinkGameIds.coveredTax,
  robuxViaLinkGameIds.notCoveredTax,
]);

function isCheckoutParentGameAcceptable(
  game: RawGame | undefined,
  gameId: string,
) {
  if (!game) return false;
  return (
    game.availability_status === "available" ||
    (game.availability_status === "hidden" &&
      isRobuxViaLinkSourceGame(gameId))
  );
}

async function safeSelect<T>(
  source: string,
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<QueryResult<T>> {
  try {
    const { data, error } = await query;
    return {
      source,
      data: error ? [] : (data ?? []),
      error: error?.message ?? null,
    };
  } catch (error) {
    return {
      source,
      data: [],
      error: error instanceof Error ? error.message : "Unknown query failure",
    };
  }
}

function latestDate(values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  );
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasUsableUrl(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validatePrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Price is missing or non-numeric.";
  }
  if (value <= 0) return "Price must be greater than zero for paid storefront products.";
  if (value > PRICE_LIMIT) {
    return `Price exceeds the supported admin review limit of PHP ${PRICE_LIMIT.toLocaleString()}.`;
  }
  return null;
}

function makeIssue(input: Omit<CatalogHealthIssue, "id">): CatalogHealthIssue {
  return {
    id: [
      input.severity,
      input.type,
      input.gameId ?? "no-game",
      input.productId ?? "no-product",
      input.currentState,
    ]
      .join(":")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
    ...input,
  };
}

function relatedProductLinks(input: {
  productId: string | null;
  gameHref: string | null;
  includeProductAssets?: boolean;
  includeRobloxSync?: boolean;
}) {
  const links: Array<{ label: string; href: string }> = [];
  if (input.gameHref) links.push({ label: "Public game page", href: input.gameHref });
  if (input.includeProductAssets) {
    links.push({ label: "Product Assets", href: "/admin/product-assets" });
  }
  if (input.includeRobloxSync) {
    links.push({ label: "Roblox Sync", href: "/admin/roblox-sync" });
  }
  return links;
}

function resolveArtwork(input: {
  override: OverrideRow | undefined;
  cache: CacheRow | undefined;
}): {
  source: CatalogHealthArtworkSource;
  urlPresent: boolean;
  matchStatus: CatalogHealthMatchStatus;
  detectedAt: string | null;
} {
  const { override, cache } = input;

  let matchStatus: CatalogHealthMatchStatus = "no_sync_record";
  if (cache?.status === "matched") matchStatus = "matched";
  else if (cache?.status === "no_match") matchStatus = "no_match";
  else if (cache?.status === "ambiguous") matchStatus = "ambiguous";

  if (override?.source === "manual") {
    if (!hasUsableUrl(override.icon_url) || !hasUsableUrl(override.storage_path)) {
      return {
        source: "broken_manual_override",
        urlPresent: hasUsableUrl(override.icon_url),
        matchStatus,
        detectedAt: override.updated_at,
      };
    }
    return {
      source: "manual_override",
      urlPresent: true,
      matchStatus,
      detectedAt: override.updated_at,
    };
  }

  if (override?.source === "placeholder") {
    return {
      source: "forced_placeholder",
      urlPresent: false,
      matchStatus,
      detectedAt: override.updated_at,
    };
  }

  if (cache?.status === "matched") {
    if (!hasUsableUrl(cache.icon_url)) {
      return {
        source: "broken_roblox_cache",
        urlPresent: false,
        matchStatus,
        detectedAt: cache.last_verified_at ?? cache.synced_at,
      };
    }
    return {
      source: "roblox_cache",
      urlPresent: true,
      matchStatus,
      detectedAt: cache.last_verified_at ?? cache.synced_at,
    };
  }

  return {
    source: "normal_placeholder",
    urlPresent: false,
    matchStatus,
    detectedAt: cache?.first_flagged_at ?? cache?.last_verified_at ?? null,
  };
}

function metric(
  id: string,
  label: string,
  value: number | null,
  unavailableReason?: string | null,
  help?: string,
): CatalogHealthMetric {
  return {
    id,
    label,
    value,
    help,
    unavailableReason: unavailableReason ?? undefined,
  };
}

export async function getCatalogHealthData(): Promise<CatalogHealthData> {
  const supabase = createAdminClient();
  const universeIds = universeIdsConfig as Record<string, number>;

  const [
    rawGamesResult,
    rawProductsResult,
    storeGamesResult,
    storeProductsResult,
    cacheResult,
    overridesResult,
  ] = await Promise.all([
    safeSelect<RawGame>(
      "XOB games",
      supabase
        .from("games")
        .select(
          "id, name, category, color, icon_url, sort_order, is_discounted, availability_status",
        )
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
    ),
    safeSelect<RawGamepass>(
      "XOB gamepasses",
      supabase
        .from("gamepasses")
        .select(
          "id, game_id, name, robux_amount, your_price, is_active, availability_status",
        )
        .order("name", { ascending: true }),
    ),
    safeSelect<StoreGameRow>(
      "store_games view",
      supabase
        .from("store_games")
        .select("id, name, slug, icon_url, availability_status")
        .order("name", { ascending: true }),
    ),
    safeSelect<StoreGamepassRow>(
      "store_gamepasses view",
      supabase
        .from("store_gamepasses")
        .select("id, game_id, name, robux_amount, price, availability_status"),
    ),
    safeSelect<CacheRow>(
      "roblox_gamepass_icon_cache",
      supabase
        .from("roblox_gamepass_icon_cache")
        .select(
          "gamepass_id, roblox_universe_id, status, icon_url, matched_name, candidate_count, synced_at, last_verified_at, first_flagged_at",
        ),
    ),
    safeSelect<OverrideRow>(
      "product_artwork_overrides",
      supabase
        .from("product_artwork_overrides")
        .select(
          "gamepass_id, source, manual_kind, icon_url, storage_path, original_url, content_type, file_size_bytes, updated_at",
        ),
    ),
  ]);

  const rawGames = rawGamesResult.data;
  const rawProducts = rawProductsResult.data;
  const storeGames = storeGamesResult.data;
  const storeProducts = storeProductsResult.data;
  const cacheRows = cacheResult.data;
  const overrides = overridesResult.data;

  const sourceStatus = [
    rawGamesResult,
    rawProductsResult,
    storeGamesResult,
    storeProductsResult,
    cacheResult,
    overridesResult,
  ].map((result) => ({
    source: result.source,
    ok: !result.error,
    message: result.error,
  }));

  const rawGameById = new Map(rawGames.map((game) => [game.id, game]));
  const storeGameById = new Map(storeGames.map((game) => [game.id, game]));
  const rawProductById = new Map(rawProducts.map((product) => [product.id, product]));
  const storeProductById = new Map(
    storeProducts.map((product) => [product.id, product]),
  );
  const cacheByProductId = new Map(
    cacheRows.map((cache) => [cache.gamepass_id, cache]),
  );
  const overrideByProductId = new Map(
    overrides.map((override) => [override.gamepass_id, override]),
  );

  const rawProductsByGameId = new Map<string, RawGamepass[]>();
  for (const product of rawProducts) {
    const list = rawProductsByGameId.get(product.game_id) ?? [];
    list.push(product);
    rawProductsByGameId.set(product.game_id, list);
  }

  const storeProductsByGameId = new Map<string, StoreGamepassRow[]>();
  for (const product of storeProducts) {
    const list = storeProductsByGameId.get(product.game_id) ?? [];
    list.push(product);
    storeProductsByGameId.set(product.game_id, list);
  }

  const gameHrefById = new Map<string, string>();
  for (const game of storeGames) {
    gameHrefById.set(game.id, `/games/${game.slug}`);
  }
  for (const gameId of robuxViaLinkSourceGameIds) {
    gameHrefById.set(gameId, "/games/robux-via-link");
  }

  const productHealth: CatalogHealthProduct[] = rawProducts.map((product) => {
    const rawGame = rawGameById.get(product.game_id);
    const storeProduct = storeProductById.get(product.id);
    const artwork = resolveArtwork({
      override: overrideByProductId.get(product.id),
      cache: cacheByProductId.get(product.id),
    });
    const configurationStatus: CatalogHealthConfigStatus =
      robuxViaLinkSourceGameIds.has(product.game_id)
        ? "special_store_route"
        : universeIds[product.game_id]
          ? "configured"
          : "not_configured";

    return {
      productId: product.id,
      productName: product.name,
      gameId: product.game_id,
      gameName: rawGame?.name ?? "Missing parent game",
      rawAvailability: product.availability_status,
      isActive: product.is_active,
      storefrontVisible: Boolean(storeProduct),
      storefrontAvailability: storeProduct?.availability_status ?? "not_visible",
      parentGameAvailability: rawGame?.availability_status ?? "missing",
      price: product.your_price,
      robuxAmount: product.robux_amount,
      artworkSource: artwork.source,
      artworkUrlPresent: artwork.urlPresent,
      robloxMatchStatus: artwork.matchStatus,
      configurationStatus,
      issueCount: 0,
      publicHref: gameHrefById.get(product.game_id) ?? null,
    };
  });

  const productHealthById = new Map(
    productHealth.map((product) => [product.productId, product]),
  );

  const issues: CatalogHealthIssue[] = [];

  for (const game of rawGames) {
    const publicGame = storeGameById.get(game.id);
    const rawGameProducts = rawProductsByGameId.get(game.id) ?? [];
    const visibleProducts = storeProductsByGameId.get(game.id) ?? [];
    const activeProducts = rawGameProducts.filter(
      (product) => product.is_active && product.availability_status !== "hidden",
    );
    const availableProducts = activeProducts.filter(
      (product) => product.availability_status === "available",
    );
    const gameHref = gameHrefById.get(game.id) ?? null;
    const configurationStatus: CatalogHealthConfigStatus =
      robuxViaLinkSourceGameIds.has(game.id)
        ? "special_store_route"
        : universeIds[game.id]
          ? "configured"
          : "not_configured";

    if (!hasUsableUrl(game.icon_url) && game.availability_status !== "hidden") {
      issues.push(
        makeIssue({
          severity: "warning",
          type: "Missing game thumbnail",
          gameId: game.id,
          gameName: game.name,
          gameAvailability: game.availability_status,
          productId: null,
          productName: null,
          productAvailability: "not_available",
          artworkSource: "not_available",
          robloxMatchStatus: "not_available",
          configurationStatus,
          currentState: "The source game has no icon URL.",
          whyItMatters:
            "Game cards depend on thumbnails for recognition and trust during browsing.",
          recommendedAction:
            "Review the game thumbnail in XOB or the source catalog data.",
          relatedLinks: relatedProductLinks({ productId: null, gameHref }),
          detectedAt: null,
        }),
      );
    }

    if (game.availability_status === "available" && activeProducts.length === 0) {
      issues.push(
        makeIssue({
          severity: "warning",
          type: "Active game with no products",
          gameId: game.id,
          gameName: game.name,
          gameAvailability: game.availability_status,
          productId: null,
          productName: null,
          productAvailability: "not_available",
          artworkSource: "not_available",
          robloxMatchStatus: "not_available",
          configurationStatus,
          currentState: "The game is marked available, but has no active non-hidden products.",
          whyItMatters:
            "Customers can reach a game that has nothing meaningful to purchase.",
          recommendedAction:
            "Review the game inventory and availability in XOB before changing Store presentation.",
          relatedLinks: relatedProductLinks({ productId: null, gameHref }),
          detectedAt: null,
        }),
      );
    }

    if (
      game.availability_status === "available" &&
      activeProducts.length > 0 &&
      availableProducts.length === 0
    ) {
      issues.push(
        makeIssue({
          severity: "warning",
          type: "Active game with no available products",
          gameId: game.id,
          gameName: game.name,
          gameAvailability: game.availability_status,
          productId: null,
          productName: null,
          productAvailability: "not_available",
          artworkSource: "not_available",
          robloxMatchStatus: "not_available",
          configurationStatus,
          currentState:
            "The game is available, but every active product is unavailable, coming soon, or hidden.",
          whyItMatters:
            "The storefront can look open while customers cannot add any product from that game.",
          recommendedAction:
            "Review product availability in XOB or mark the game temporarily unavailable.",
          relatedLinks: relatedProductLinks({ productId: null, gameHref }),
          detectedAt: null,
        }),
      );
    }

    if (
      !universeIds[game.id] &&
      !robuxViaLinkSourceGameIds.has(game.id) &&
      (publicGame || visibleProducts.length > 0)
    ) {
      issues.push(
        makeIssue({
          severity: "information",
          type: "Game not configured for Roblox sync",
          gameId: game.id,
          gameName: game.name,
          gameAvailability: game.availability_status,
          productId: null,
          productName: null,
          productAvailability: "not_available",
          artworkSource: "not_available",
          robloxMatchStatus: "not_available",
          configurationStatus,
          currentState: "No Roblox universe ID is configured for this Store game.",
          whyItMatters:
            "Products for this game cannot receive automatic Roblox Game Pass artwork until a universe ID is configured.",
          recommendedAction:
            "If this game should sync with Roblox, add its universe ID to the Store configuration and run the offline sync.",
          relatedLinks: relatedProductLinks({
            productId: null,
            gameHref,
            includeRobloxSync: true,
          }),
          detectedAt: null,
        }),
      );
    }
  }

  for (const product of rawProducts) {
    const rawGame = rawGameById.get(product.game_id);
    const storeProduct = storeProductById.get(product.id);
    const productRow = productHealthById.get(product.id);
    const artwork = resolveArtwork({
      override: overrideByProductId.get(product.id),
      cache: cacheByProductId.get(product.id),
    });
    const isPublicProduct = Boolean(storeProduct);
    const isActiveProduct = product.is_active && product.availability_status !== "hidden";
    const gameHref = gameHrefById.get(product.game_id) ?? null;
    const configurationStatus: CatalogHealthConfigStatus =
      robuxViaLinkSourceGameIds.has(product.game_id)
        ? "special_store_route"
        : universeIds[product.game_id]
          ? "configured"
          : "not_configured";

    if (!rawGame) {
      issues.push(
        makeIssue({
          severity: "critical",
          type: "Product missing parent game",
          gameId: product.game_id,
          gameName: "Missing parent game",
          gameAvailability: "missing",
          productId: product.id,
          productName: product.name,
          productAvailability: product.availability_status,
          artworkSource: artwork.source,
          robloxMatchStatus: artwork.matchStatus,
          configurationStatus,
          currentState: `Product references game_id ${product.game_id}, but that game was not found.`,
          whyItMatters:
            "Checkout and storefront grouping require a valid parent game.",
          recommendedAction:
            "Review the product in XOB and restore or correct its parent game relationship.",
          relatedLinks: relatedProductLinks({
            productId: product.id,
            gameHref,
            includeProductAssets: true,
          }),
          detectedAt: null,
        }),
      );
    }

    if (isActiveProduct) {
      const priceProblem = validatePrice(product.your_price);
      if (priceProblem) {
        issues.push(
          makeIssue({
            severity: "critical",
            type: "Active product with invalid price",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState: priceProblem,
            whyItMatters:
              "The Store cannot safely display or charge an invalid active product price.",
            recommendedAction:
              "Review the product price in XOB before customers attempt checkout.",
            relatedLinks: relatedProductLinks({ productId: product.id, gameHref }),
            detectedAt: null,
          }),
        );
      }

      if (!isPositiveNumber(product.robux_amount)) {
        issues.push(
          makeIssue({
            severity: "critical",
            type: "Active product with invalid Robux amount",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState: "The active product has no positive Robux amount.",
            whyItMatters:
              "Order messages and customer scanning depend on a clear Robux amount.",
            recommendedAction:
              "Review the product amount in XOB.",
            relatedLinks: relatedProductLinks({ productId: product.id, gameHref }),
            detectedAt: null,
          }),
        );
      }
    }

    if (
      isPublicProduct &&
      product.availability_status === "available" &&
      rawGame &&
      rawGame.availability_status !== "available"
    ) {
      const isViaLinkSource = isRobuxViaLinkSourceGame(product.game_id);
      const checkoutParentAcceptable = isCheckoutParentGameAcceptable(
        rawGame,
        product.game_id,
      );
      const parentIssue =
        isViaLinkSource && rawGame.availability_status === "hidden"
          ? {
              severity: "information" as const,
              type: "Intentional virtual-category parent",
              currentState:
                "The source parent game is hidden to prevent duplicate catalog entries.",
              whyItMatters:
                "These products are exposed through the combined Robux Via Link page and are explicitly supported by checkout.",
              recommendedAction:
                "No XOB data change is needed. Keep this exception limited to the configured Robux Via Link source games.",
            }
          : rawGame.availability_status === "hidden"
            ? {
                severity: "information" as const,
                type: "Hidden legacy source record",
                currentState:
                  "The product record exists in source data under a hidden or retired parent game.",
                whyItMatters:
                  "It can appear in broad product diagnostics, but it is not exposed through an active purchasable game page.",
                recommendedAction:
                  "Review manually only if this legacy product should be restored in XOB.",
              }
            : {
                severity: "information" as const,
                type: "Unavailable parent - product not addable",
                currentState: `The product row is active, but the parent game is ${rawGame.availability_status}.`,
                whyItMatters:
                  "The standard game page correctly hides purchase controls while the parent game is unavailable.",
                recommendedAction:
                  "No Store repair is needed unless XOB intends this parent game to become purchasable again.",
              };

      issues.push(
        makeIssue({
          severity: checkoutParentAcceptable
            ? parentIssue.severity
            : parentIssue.severity,
          type: parentIssue.type,
          gameId: product.game_id,
          gameName: rawGame.name,
          gameAvailability: rawGame.availability_status,
          productId: product.id,
          productName: product.name,
          productAvailability: product.availability_status,
          artworkSource: artwork.source,
          robloxMatchStatus: artwork.matchStatus,
          configurationStatus,
          currentState: parentIssue.currentState,
          whyItMatters: parentIssue.whyItMatters,
          recommendedAction: parentIssue.recommendedAction,
          relatedLinks: relatedProductLinks({
            productId: product.id,
            gameHref,
            includeProductAssets: isViaLinkSource,
          }),
          detectedAt: null,
        }),
      );

      if (!checkoutParentAcceptable && isViaLinkSource) {
        issues.push(
          makeIssue({
            severity: "critical",
            type: "Public product blocked by checkout parent availability",
            gameId: product.game_id,
            gameName: rawGame.name,
            gameAvailability: rawGame.availability_status,
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState:
              "This product is shown in the Robux Via Link purchase flow, but checkout would reject its parent game state.",
            whyItMatters:
              "Customers could add the product and only learn about the problem during checkout.",
            recommendedAction:
              "Keep checkout and the Robux Via Link route using the same explicit source-game exception.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeProductAssets: true,
            }),
            detectedAt: null,
          }),
        );
      }
    }

    if (storeProduct && (!product.is_active || product.availability_status === "hidden")) {
      issues.push(
        makeIssue({
          severity: "critical",
          type: "Invalid availability combination",
          gameId: product.game_id,
          gameName: rawGame?.name ?? "Missing parent game",
          gameAvailability: rawGame?.availability_status ?? "missing",
          productId: product.id,
          productName: product.name,
          productAvailability: product.is_active ? product.availability_status : "inactive",
          artworkSource: artwork.source,
          robloxMatchStatus: artwork.matchStatus,
          configurationStatus,
          currentState:
            "A product appears in store_gamepasses even though the raw product is inactive or hidden.",
          whyItMatters:
            "The public product view should only expose active, non-hidden products.",
          recommendedAction:
            "Review the store_gamepasses view definition and the source product in XOB.",
          relatedLinks: relatedProductLinks({ productId: product.id, gameHref }),
          detectedAt: null,
        }),
      );
    }

    if (isPublicProduct) {
      if (artwork.source === "broken_manual_override") {
        issues.push(
          makeIssue({
            severity: "critical",
            type: "Broken manual artwork override",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState:
              "Manual artwork is selected, but the override is missing a usable URL or storage path.",
            whyItMatters:
              "Manual artwork should be stable because it overrides automated Roblox artwork.",
            recommendedAction:
              "Replace the manual image or restore Roblox/default placeholder in Product Assets.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeProductAssets: true,
            }),
            detectedAt: artwork.detectedAt,
          }),
        );
      } else if (artwork.source === "broken_roblox_cache") {
        issues.push(
          makeIssue({
            severity: "warning",
            type: "Broken Roblox cache artwork",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState:
              "The Roblox cache says the product is matched, but no icon URL is stored.",
            whyItMatters:
              "The product will fall back visually instead of showing official artwork.",
            recommendedAction:
              "Review the product in Product Assets or rerun the offline Roblox sync.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeProductAssets: true,
              includeRobloxSync: true,
            }),
            detectedAt: artwork.detectedAt,
          }),
        );
      } else if (artwork.source === "normal_placeholder") {
        issues.push(
          makeIssue({
            severity: "information",
            type: "Normal fallback placeholder",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState:
              "The product currently renders the normal generated placeholder.",
            whyItMatters:
              "This is functioning fallback behavior, though custom or Roblox artwork can improve trust and scanning.",
            recommendedAction:
              "Review Product Assets only if this product should use manual or Roblox artwork.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeProductAssets: true,
              includeRobloxSync: true,
            }),
            detectedAt: artwork.detectedAt,
          }),
        );
      } else if (artwork.source === "forced_placeholder") {
        issues.push(
          makeIssue({
            severity: "information",
            type: "Forced placeholder",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState:
              "An admin override intentionally forces this product to use placeholder artwork.",
            whyItMatters:
              "Forced placeholders are deliberate Store presentation metadata, not missing artwork.",
            recommendedAction:
              "Keep as-is unless Product Assets should restore Roblox or manual artwork.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeProductAssets: true,
            }),
            detectedAt: artwork.detectedAt,
          }),
        );
      }

      if (artwork.matchStatus === "ambiguous") {
        issues.push(
          makeIssue({
            severity: "warning",
            type: "Roblox ambiguous match",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState:
              "Roblox sync found multiple possible Game Pass matches.",
            whyItMatters:
              "Ambiguous matches can show the wrong artwork if resolved automatically.",
            recommendedAction:
              "Review the product name and Roblox match in the Roblox Sync dashboard.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeRobloxSync: true,
            }),
            detectedAt: artwork.detectedAt,
          }),
        );
      } else if (artwork.matchStatus === "no_match") {
        issues.push(
          makeIssue({
            severity: "information",
            type: "Roblox no match",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState:
              "Roblox sync completed, but no reliable Game Pass match was found.",
            whyItMatters:
              "The product will use manual artwork or placeholder treatment until a match exists.",
            recommendedAction:
              "Review the product name, aliases, or manual artwork if this product should have official art.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeProductAssets: true,
              includeRobloxSync: true,
            }),
            detectedAt: artwork.detectedAt,
          }),
        );
      } else if (artwork.matchStatus === "no_sync_record" && configurationStatus !== "special_store_route") {
        issues.push(
          makeIssue({
            severity: "information",
            type: "No Roblox sync record",
            gameId: product.game_id,
            gameName: rawGame?.name ?? "Missing parent game",
            gameAvailability: rawGame?.availability_status ?? "missing",
            productId: product.id,
            productName: product.name,
            productAvailability: product.availability_status,
            artworkSource: artwork.source,
            robloxMatchStatus: artwork.matchStatus,
            configurationStatus,
            currentState: "No Roblox cache row exists for this public product.",
            whyItMatters:
              "This can be normal for games not configured for sync, but it explains why official artwork is absent.",
            recommendedAction:
              "If this product should sync, confirm the parent game has a universe ID and run the offline sync.",
            relatedLinks: relatedProductLinks({
              productId: product.id,
              gameHref,
              includeRobloxSync: true,
            }),
            detectedAt: null,
          }),
        );
      }
    }

    if (productRow) {
      productRow.issueCount = issues.filter(
        (issue) => issue.productId === product.id,
      ).length;
    }
  }

  for (const storeProduct of storeProducts) {
    if (!rawProductById.has(storeProduct.id)) {
      issues.push(
        makeIssue({
          severity: "critical",
          type: "Public product missing source record",
          gameId: storeProduct.game_id,
          gameName: rawGameById.get(storeProduct.game_id)?.name ?? "Missing parent game",
          gameAvailability:
            rawGameById.get(storeProduct.game_id)?.availability_status ?? "missing",
          productId: storeProduct.id,
          productName: storeProduct.name,
          productAvailability: storeProduct.availability_status,
          artworkSource: "not_available",
          robloxMatchStatus: "not_available",
          configurationStatus: universeIds[storeProduct.game_id]
            ? "configured"
            : "not_configured",
          currentState:
            "store_gamepasses returned a product that was not found in the source gamepasses table.",
          whyItMatters:
            "The public view and checkout source data are out of agreement.",
          recommendedAction:
            "Review the public view and XOB inventory source data.",
          relatedLinks: relatedProductLinks({
            productId: storeProduct.id,
            gameHref: gameHrefById.get(storeProduct.game_id) ?? null,
          }),
          detectedAt: null,
        }),
      );
    }
  }

  const orphanedRecords: CatalogHealthOrphan[] = [];
  for (const cache of cacheRows) {
    if (!rawProductById.has(cache.gamepass_id)) {
      const orphan = {
        id: `cache-${cache.gamepass_id}`,
        recordType: "roblox_cache" as const,
        recordId: cache.gamepass_id,
        currentState: `Cache row has status ${cache.status}, but the product no longer exists in gamepasses.`,
        recommendedAction:
          "Review the cache row after confirming whether XOB intentionally removed the product.",
        detectedAt: cache.last_verified_at ?? cache.synced_at,
      };
      orphanedRecords.push(orphan);
      issues.push(
        makeIssue({
          severity: "warning",
          type: "Orphaned Roblox cache row",
          gameId: null,
          gameName: null,
          gameAvailability: "not_available",
          productId: cache.gamepass_id,
          productName: null,
          productAvailability: "missing",
          artworkSource: "not_available",
          robloxMatchStatus: cache.status,
          configurationStatus: "not_available",
          currentState: orphan.currentState,
          whyItMatters:
            "Store-owned cache records should point to current XOB products so diagnostics stay clear.",
          recommendedAction: orphan.recommendedAction,
          relatedLinks: [{ label: "Roblox Sync", href: "/admin/roblox-sync" }],
          detectedAt: orphan.detectedAt,
        }),
      );
    }
  }

  for (const override of overrides) {
    if (!rawProductById.has(override.gamepass_id)) {
      const orphan = {
        id: `override-${override.gamepass_id}`,
        recordType: "artwork_override" as const,
        recordId: override.gamepass_id,
        currentState: `Artwork override uses source ${override.source}, but the product no longer exists in gamepasses.`,
        recommendedAction:
          "Review the override after confirming whether XOB intentionally removed the product.",
        detectedAt: override.updated_at,
      };
      orphanedRecords.push(orphan);
      issues.push(
        makeIssue({
          severity: "warning",
          type: "Orphaned artwork override",
          gameId: null,
          gameName: null,
          gameAvailability: "not_available",
          productId: override.gamepass_id,
          productName: null,
          productAvailability: "missing",
          artworkSource:
            override.source === "placeholder"
              ? "forced_placeholder"
              : hasUsableUrl(override.icon_url)
                ? "manual_override"
                : "broken_manual_override",
          robloxMatchStatus: "not_available",
          configurationStatus: "not_available",
          currentState: orphan.currentState,
          whyItMatters:
            "Store-owned manual presentation records should not linger after XOB removes a product.",
          recommendedAction: orphan.recommendedAction,
          relatedLinks: [{ label: "Product Assets", href: "/admin/product-assets" }],
          detectedAt: orphan.detectedAt,
        }),
      );
    }
  }

  const duplicateGroups = buildDuplicateGroups(rawGames, rawProducts, rawGameById);
  for (const group of duplicateGroups) {
    issues.push(
      makeIssue({
        severity: "information",
        type:
          group.recordType === "game"
            ? "Duplicate-looking game names"
            : "Duplicate-looking product names",
        gameId: group.gameId,
        gameName: group.gameName,
        gameAvailability: "not_available",
        productId: null,
        productName: null,
        productAvailability: "not_available",
        artworkSource: "not_available",
        robloxMatchStatus: "not_available",
        configurationStatus: "not_available",
        currentState: `Possible duplicate - manual review required: ${group.names.join(", ")}`,
        whyItMatters:
          "Near-duplicate names can confuse Roblox matching and customer browsing.",
        recommendedAction:
          "Review these records manually. Do not merge or delete without checking XOB inventory intent.",
        relatedLinks: [],
        detectedAt: null,
      }),
    );
  }

  const issueCountsByProductId = new Map<string, number>();
  for (const issue of issues) {
    if (!issue.productId) continue;
    issueCountsByProductId.set(
      issue.productId,
      (issueCountsByProductId.get(issue.productId) ?? 0) + 1,
    );
  }
  for (const product of productHealth) {
    product.issueCount = issueCountsByProductId.get(product.productId) ?? 0;
  }

  const invalidPriceCount = issues.filter(
    (issue) =>
      issue.type === "Active product with invalid price" ||
      issue.type === "Active product with invalid Robux amount",
  ).length;
  const productsWithoutCustomOrRobloxArtworkCount = productHealth.filter(
    (product) =>
      product.storefrontVisible &&
      (product.artworkSource === "normal_placeholder" ||
        product.artworkSource === "forced_placeholder"),
  ).length;
  const storefrontAvailableProducts = storeProducts.filter(
    (product) => product.availability_status === "available",
  );
  const intentionalVirtualCategoryParentProducts =
    storefrontAvailableProducts.filter((product) => {
      const game = rawGameById.get(product.game_id);
      return (
        isRobuxViaLinkSourceGame(product.game_id) &&
        game?.availability_status === "hidden"
      );
    }).length;
  const standardUnavailableParentProducts = storefrontAvailableProducts.filter(
    (product) => {
      const game = rawGameById.get(product.game_id);
      return (
        !isRobuxViaLinkSourceGame(product.game_id) &&
        (game?.availability_status === "temporarily_unavailable" ||
          game?.availability_status === "coming_soon")
      );
    },
  ).length;
  const hiddenLegacySourceProducts = storefrontAvailableProducts.filter(
    (product) => {
      const game = rawGameById.get(product.game_id);
      return (
        !isRobuxViaLinkSourceGame(product.game_id) &&
        game?.availability_status === "hidden"
      );
    },
  ).length;
  const publiclyAddableBlockedProducts = storefrontAvailableProducts.filter(
    (product) =>
      isRobuxViaLinkSourceGame(product.game_id) &&
      !isCheckoutParentGameAcceptable(
        rawGameById.get(product.game_id),
        product.game_id,
      ),
  ).length;

  const gameCoverage = rawGames.map((game) => {
    const visibleProducts = storeProductsByGameId.get(game.id) ?? [];
    const rawGameProducts = rawProductsByGameId.get(game.id) ?? [];
    const cacheForGame = rawGameProducts
      .map((product) => cacheByProductId.get(product.id))
      .filter(Boolean) as CacheRow[];
    return {
      gameId: game.id,
      gameName: game.name,
      slug: storeGameById.get(game.id)?.slug ?? null,
      rawAvailability: game.availability_status,
      storefrontAvailability:
        storeGameById.get(game.id)?.availability_status ??
        ("not_visible" as const),
      rawProductCount: rawGameProducts.length,
      storefrontProductCount: visibleProducts.length,
      availableProductCount: visibleProducts.filter(
        (product) => product.availability_status === "available",
      ).length,
      thumbnailPresent: hasUsableUrl(game.icon_url),
      configurationStatus: (robuxViaLinkSourceGameIds.has(game.id)
        ? "special_store_route"
        : universeIds[game.id]
          ? "configured"
          : "not_configured") as CatalogHealthConfigStatus,
      universeId: universeIds[game.id] ?? null,
      latestSyncAt: latestDate(
        cacheForGame.map((cache) => cache.last_verified_at ?? cache.synced_at),
      ),
      publicHref: gameHrefById.get(game.id) ?? null,
    };
  });

  const rawGamesUnavailable = rawGamesResult.error;
  const rawProductsUnavailable = rawProductsResult.error;
  const storeGamesUnavailable = storeGamesResult.error;
  const storeProductsUnavailable = storeProductsResult.error;
  const cacheUnavailable = cacheResult.error;
  const overridesUnavailable = overridesResult.error;

  const summary = [
    metric(
      "xob-game-records",
      "XOB game records",
      rawGamesUnavailable ? null : rawGames.length,
      rawGamesUnavailable,
    ),
    metric(
      "public-catalog-game-rows",
      "Public catalog game rows",
      storeGamesUnavailable ? null : storeGames.length,
      storeGamesUnavailable,
    ),
    metric(
      "active-public-game-pages",
      "Active public game pages",
      storeGamesUnavailable
        ? null
        : storeGames.filter((game) => game.availability_status === "available").length,
      storeGamesUnavailable,
    ),
    metric(
      "virtual-store-categories",
      "Virtual Store categories",
      1,
      null,
      "Robux Via Link is a Store category, not a raw XOB game row.",
    ),
    metric(
      "storefront-products",
      "Storefront products",
      storeProductsUnavailable ? null : storeProducts.length,
      storeProductsUnavailable,
    ),
    metric(
      "available-products",
      "Available products",
      storeProductsUnavailable
        ? null
        : storeProducts.filter((product) => product.availability_status === "available")
            .length,
      storeProductsUnavailable,
    ),
    metric(
      "unavailable-products",
      "Unavailable products",
      storeProductsUnavailable
        ? null
        : storeProducts.filter((product) => product.availability_status !== "available")
            .length,
      storeProductsUnavailable,
    ),
    metric(
      "games-with-no-products",
      "Games with no storefront products",
      rawGamesUnavailable || storeProductsUnavailable
        ? null
        : rawGames.filter(
            (game) =>
              game.availability_status !== "hidden" &&
              (storeProductsByGameId.get(game.id) ?? []).length === 0,
          ).length,
      rawGamesUnavailable ?? storeProductsUnavailable,
    ),
    metric(
      "active-games-no-available-products",
      "Active games with no available products",
      rawGamesUnavailable || rawProductsUnavailable
        ? null
        : rawGames.filter((game) => {
            if (game.availability_status !== "available") return false;
            return !rawProducts.some(
              (product) =>
                product.game_id === game.id &&
                product.is_active &&
                product.availability_status === "available",
            );
          }).length,
      rawGamesUnavailable ?? rawProductsUnavailable,
    ),
    metric(
      "products-without-custom-or-roblox-artwork",
      "Products without custom or Roblox artwork",
      storeProductsUnavailable || cacheUnavailable || overridesUnavailable
        ? null
        : productsWithoutCustomOrRobloxArtworkCount,
      storeProductsUnavailable ?? cacheUnavailable ?? overridesUnavailable,
      "Normal and forced placeholders render successfully; broken artwork is classified separately.",
    ),
    metric(
      "intentional-virtual-category-parent-products",
      "Intentional virtual-category parent products",
      rawGamesUnavailable || storeProductsUnavailable
        ? null
        : intentionalVirtualCategoryParentProducts,
      rawGamesUnavailable ?? storeProductsUnavailable,
      "Configured Robux Via Link products whose source parents are intentionally hidden.",
    ),
    metric(
      "standard-unavailable-parent-products",
      "Standard unavailable-parent products",
      rawGamesUnavailable || storeProductsUnavailable
        ? null
        : standardUnavailableParentProducts,
      rawGamesUnavailable ?? storeProductsUnavailable,
      "Rows remain active, but standard game pages do not show purchase controls.",
    ),
    metric(
      "hidden-legacy-source-products",
      "Hidden legacy source products",
      rawGamesUnavailable || storeProductsUnavailable
        ? null
        : hiddenLegacySourceProducts,
      rawGamesUnavailable ?? storeProductsUnavailable,
      "Source records under hidden retired or duplicate games.",
    ),
    metric(
      "publicly-addable-products-blocked-by-checkout",
      "Publicly addable products blocked by checkout",
      rawGamesUnavailable || storeProductsUnavailable
        ? null
        : publiclyAddableBlockedProducts,
      rawGamesUnavailable ?? storeProductsUnavailable,
      "Should stay at zero after checkout and storefront rules agree.",
    ),
    metric(
      "games-missing-thumbnails",
      "Games missing thumbnails",
      rawGamesUnavailable
        ? null
        : rawGames.filter(
            (game) => game.availability_status !== "hidden" && !hasUsableUrl(game.icon_url),
          ).length,
      rawGamesUnavailable,
    ),
    metric(
      "products-no-sync-record",
      "Products with no Roblox sync record",
      storeProductsUnavailable || cacheUnavailable
        ? null
        : storeProducts.filter((product) => !cacheByProductId.has(product.id)).length,
      storeProductsUnavailable ?? cacheUnavailable,
    ),
    metric(
      "no-match-products",
      "No-match Roblox products",
      cacheUnavailable ? null : cacheRows.filter((cache) => cache.status === "no_match").length,
      cacheUnavailable,
    ),
    metric(
      "ambiguous-products",
      "Ambiguous Roblox products",
      cacheUnavailable ? null : cacheRows.filter((cache) => cache.status === "ambiguous").length,
      cacheUnavailable,
    ),
    metric(
      "invalid-price-records",
      "Invalid price records",
      rawProductsUnavailable ? null : invalidPriceCount,
      rawProductsUnavailable,
    ),
    metric(
      "orphaned-products",
      "Orphaned products",
      rawGamesUnavailable || rawProductsUnavailable
        ? null
        : rawProducts.filter((product) => !rawGameById.has(product.game_id)).length,
      rawGamesUnavailable ?? rawProductsUnavailable,
    ),
    metric(
      "orphaned-store-records",
      "Orphaned Store-owned artwork/cache records",
      rawProductsUnavailable || cacheUnavailable || overridesUnavailable
        ? null
        : orphanedRecords.length,
      rawProductsUnavailable ?? cacheUnavailable ?? overridesUnavailable,
    ),
  ];

  const severityOrder: Record<CatalogHealthIssue["severity"], number> = {
    critical: 0,
    warning: 1,
    information: 2,
  };

  const sortedIssues = issues.sort((a, b) => {
    const severityDelta = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return a.type.localeCompare(b.type) || (a.gameName ?? "").localeCompare(b.gameName ?? "");
  });

  return {
    summary,
    issues: sortedIssues,
    priorityIssues: sortedIssues
      .filter((issue) => issue.severity === "critical" || issue.severity === "warning")
      .slice(0, 20),
    gameCoverage,
    productHealth: productHealth.sort(
      (a, b) =>
        a.gameName.localeCompare(b.gameName) ||
        a.productName.localeCompare(b.productName),
    ),
    orphanedRecords,
    duplicateGroups,
    sourceStatus,
    filters: {
      games: rawGames
        .map((game) => ({ id: game.id, name: game.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      issueTypes: [...new Set(sortedIssues.map((issue) => issue.type))].sort(),
    },
    rules: {
      storefrontVisibility: [
        "Public catalog pages read store_games and store_gamepasses.",
        "store_games excludes hidden games, but derives available games with no purchasable products to temporarily unavailable.",
        "store_gamepasses includes products where is_active is true and product availability is not hidden.",
        "Checkout revalidates raw product activity, product availability, and parent game availability before creating orders.",
        "The only parent-game exception is the configured Robux Via Link source games, whose parents may remain hidden to prevent duplicate catalog cards.",
      ],
      priceValidation: [
        "Active non-hidden products require a numeric price greater than zero.",
        `Prices above PHP ${PRICE_LIMIT.toLocaleString()} are flagged for manual review as outside the supported Store UI range.`,
        "Active non-hidden products require a positive Robux amount for order slips and customer scanning.",
      ],
      artworkFallback: [
        "Current Store rendering checks manual overrides first.",
        "A forced placeholder override intentionally suppresses cached Roblox artwork.",
        "If no override exists, matched Roblox cache artwork is used when it has an icon URL.",
        "Products without manual or Roblox artwork use the normal generated placeholder; that is not critical by itself.",
      ],
      orphanDetection: [
        "A Roblox cache row is orphaned when its gamepass_id no longer exists in XOB gamepasses.",
        "An artwork override is orphaned when its gamepass_id no longer exists in XOB gamepasses.",
        "A product is orphaned when its game_id cannot be resolved in XOB games.",
      ],
      duplicateDetection: [
        "Names are lowercased, trimmed, stripped of simple punctuation, and compared with repeated whitespace collapsed.",
        "Duplicate-looking records are labeled for manual review only; the dashboard never merges or deletes them.",
      ],
    },
  };
}

function buildDuplicateGroups(
  games: RawGame[],
  products: RawGamepass[],
  gameById: Map<string, RawGame>,
): CatalogHealthDuplicateGroup[] {
  const groups: CatalogHealthDuplicateGroup[] = [];
  const gamesByNormalizedName = new Map<string, RawGame[]>();

  for (const game of games) {
    const normalized = normalizeName(game.name);
    if (!normalized) continue;
    const list = gamesByNormalizedName.get(normalized) ?? [];
    list.push(game);
    gamesByNormalizedName.set(normalized, list);
  }

  for (const [normalizedName, records] of gamesByNormalizedName) {
    if (records.length <= 1) continue;
    groups.push({
      id: `game-${normalizedName}`,
      recordType: "game",
      normalizedName,
      names: [...new Set(records.map((record) => record.name))],
      gameId: null,
      gameName: null,
      records: records.map((record) => ({
        id: record.id,
        name: record.name,
        availability: record.availability_status,
      })),
    });
  }

  const productsByGameAndName = new Map<string, RawGamepass[]>();
  for (const product of products) {
    const normalized = normalizeName(product.name);
    if (!normalized) continue;
    const key = `${product.game_id}:${normalized}`;
    const list = productsByGameAndName.get(key) ?? [];
    list.push(product);
    productsByGameAndName.set(key, list);
  }

  for (const [key, records] of productsByGameAndName) {
    if (records.length <= 1) continue;
    const [gameId, normalizedName] = key.split(":");
    groups.push({
      id: `product-${key}`,
      recordType: "product",
      normalizedName,
      names: [...new Set(records.map((record) => record.name))],
      gameId,
      gameName: gameById.get(gameId)?.name ?? "Missing parent game",
      records: records.map((record) => ({
        id: record.id,
        name: record.name,
        availability: record.is_active ? record.availability_status : "inactive",
      })),
    });
  }

  return groups;
}
