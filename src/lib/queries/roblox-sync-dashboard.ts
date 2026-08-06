import "server-only";
import universeIdsConfig from "@/config/roblox-universe-ids.json";
import { createAdminClient } from "@/lib/supabase/admin";

export type MatchStatus = "matched" | "no_match" | "ambiguous" | "no_sync_record";
export type RenderedArtworkSource =
  | "manual_override"
  | "roblox_cache"
  | "forced_placeholder"
  | "placeholder";
export type GameConfigurationStatus =
  | "configured"
  | "not_configured"
  | "no_products"
  | "no_cache_activity";

export interface RobloxSyncSummary {
  storeGames: number;
  configuredSyncGames: number;
  gamesWithoutUniverseConfig: number;
  storefrontProducts: number;
  cacheRecords: number;
  matched: number;
  noMatch: number;
  ambiguous: number;
  noSyncRecord: number;
  manualOverrides: number;
  forcedPlaceholders: number;
  latestSyncActivity: string | null;
}

export interface RobloxSyncCoverageGame {
  gameId: string;
  gameName: string;
  universeId: number | null;
  configurationStatus: GameConfigurationStatus;
  productCount: number;
  cacheRowCount: number;
  matchedCount: number;
  noMatchCount: number;
  ambiguousCount: number;
  noSyncRecordCount: number;
  latestVerifiedAt: string | null;
  latestSyncLogAt: string | null;
}

export interface LatestSyncWindow {
  inferred: boolean;
  observedStartAt: string | null;
  observedEndAt: string | null;
  uniqueGames: number;
  counts: {
    unchanged: number;
    new: number;
    renamed: number;
    removed: number;
    thumbnailUrlChanged: number;
    ambiguous: number;
    noMatch: number;
  };
}

export interface RobloxSyncLogEntry {
  id: string;
  gameId: string;
  gameName: string;
  universeId: number;
  syncedAt: string;
  unchangedCount: number;
  newCount: number;
  renamedCount: number;
  removedCount: number;
  thumbnailUrlChangedCount: number;
  ambiguousCount: number;
  noMatchCount: number;
  detailsJson: string;
  detailCount: number;
}

export interface RobloxSyncChangeEvent {
  id: string;
  logId: string;
  gameId: string;
  gameName: string;
  universeId: number;
  detectedAt: string;
  type: string;
  label: string;
  productName: string | null;
  robloxPassName: string | null;
  robloxGamePassId: number | null;
  previousValue: string | null;
  newValue: string | null;
  rawJson: string;
}

export interface RobloxMatchReviewItem {
  productId: string;
  productName: string;
  gameId: string;
  gameName: string;
  universeId: number | null;
  configurationStatus: "configured" | "not_configured";
  matchStatus: MatchStatus;
  cachedSource: "roblox" | "manual" | null;
  matchedRobloxPassName: string | null;
  robloxGamePassId: number | null;
  candidateCount: number | null;
  lastVerifiedAt: string | null;
  firstFlaggedAt: string | null;
  renderedArtworkSource: RenderedArtworkSource;
  candidateDetailsAvailable: boolean;
}

export interface RobloxSyncDashboardData {
  summary: RobloxSyncSummary;
  coverage: RobloxSyncCoverageGame[];
  latestWindow: LatestSyncWindow | null;
  recentLogs: RobloxSyncLogEntry[];
  recentChanges: RobloxSyncChangeEvent[];
  matchReview: RobloxMatchReviewItem[];
  gameOptions: { id: string; name: string }[];
  changeTypeOptions: { value: string; label: string }[];
  limitations: string[];
}

type SyncLogRow = {
  id: string;
  game_id: string;
  roblox_universe_id: number;
  synced_at: string;
  unchanged_count: number;
  new_count: number;
  artwork_updated_count: number;
  renamed_count: number;
  removed_count: number;
  ambiguous_count: number;
  no_match_count: number;
  details: unknown;
};

function maxDate(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function safeDetailsArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  );
}

function stringifyDetail(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Not available";
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function changeLabel(type: string) {
  const labels: Record<string, string> = {
    new_match: "Match restored",
    artwork_updated: "Thumbnail URL changed",
    renamed: "Roblox pass renamed",
    removed: "Match lost",
    ambiguous: "Match became ambiguous",
    new_roblox_pass: "New Roblox pass discovered",
    removed_roblox_pass: "Roblox pass removed",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function inferLatestWindow(logs: SyncLogRow[]): LatestSyncWindow | null {
  if (logs.length === 0) return null;

  const sorted = [...logs].sort(
    (a, b) => new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime(),
  );
  const latest = new Date(sorted[0].synced_at).getTime();
  const windowMs = 90_000;
  const grouped = sorted.filter(
    (log) => latest - new Date(log.synced_at).getTime() <= windowMs,
  );

  const times = grouped.map((log) => log.synced_at);
  return {
    inferred: true,
    observedStartAt: maxDate(times.map((time) => time)) === null
      ? null
      : times.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0],
    observedEndAt: maxDate(times),
    uniqueGames: new Set(grouped.map((log) => log.game_id)).size,
    counts: grouped.reduce(
      (acc, log) => {
        acc.unchanged += log.unchanged_count;
        acc.new += log.new_count;
        acc.renamed += log.renamed_count;
        acc.removed += log.removed_count;
        acc.thumbnailUrlChanged += log.artwork_updated_count;
        acc.ambiguous += log.ambiguous_count;
        acc.noMatch += log.no_match_count;
        return acc;
      },
      {
        unchanged: 0,
        new: 0,
        renamed: 0,
        removed: 0,
        thumbnailUrlChanged: 0,
        ambiguous: 0,
        noMatch: 0,
      },
    ),
  };
}

export async function getRobloxSyncDashboardData(): Promise<RobloxSyncDashboardData> {
  const supabase = createAdminClient();
  const universeIds = universeIdsConfig as Record<string, number>;

  const [
    gamesResult,
    productsResult,
    cacheResult,
    overridesResult,
    logsResult,
  ] = await Promise.all([
    supabase
      .from("store_games")
      .select("id, name, slug, availability_status")
      .order("name", { ascending: true }),
    supabase.from("store_gamepasses").select("id, game_id, name"),
    supabase.from("roblox_gamepass_icon_cache").select("*"),
    supabase
      .from("product_artwork_overrides")
      .select("gamepass_id, source, manual_kind, icon_url, storage_path"),
    supabase
      .from("roblox_sync_log")
      .select("*")
      .order("synced_at", { ascending: false })
      .limit(200),
  ]);

  if (gamesResult.error) throw gamesResult.error;
  if (productsResult.error) throw productsResult.error;
  if (cacheResult.error) throw cacheResult.error;
  if (overridesResult.error) throw overridesResult.error;
  if (logsResult.error) throw logsResult.error;

  const games = gamesResult.data ?? [];
  const products = productsResult.data ?? [];
  const cacheRows = cacheResult.data ?? [];
  const overrides = overridesResult.data ?? [];
  const logs = logsResult.data ?? [];

  const gameById = new Map(games.map((game) => [game.id, game]));
  const productsByGameId = new Map<string, typeof products>();
  for (const product of products) {
    const list = productsByGameId.get(product.game_id) ?? [];
    list.push(product);
    productsByGameId.set(product.game_id, list);
  }

  const cacheByProductId = new Map(
    cacheRows.map((row) => [row.gamepass_id, row]),
  );
  const cacheByGameId = new Map<string, typeof cacheRows>();
  for (const row of cacheRows) {
    const gameId = products.find((product) => product.id === row.gamepass_id)?.game_id;
    if (!gameId) continue;
    const list = cacheByGameId.get(gameId) ?? [];
    list.push(row);
    cacheByGameId.set(gameId, list);
  }

  const overrideByProductId = new Map(
    overrides.map((override) => [override.gamepass_id, override]),
  );
  const latestLogByGameId = new Map<string, SyncLogRow>();
  for (const log of logs) {
    const existing = latestLogByGameId.get(log.game_id);
    if (
      !existing ||
      new Date(log.synced_at).getTime() > new Date(existing.synced_at).getTime()
    ) {
      latestLogByGameId.set(log.game_id, log);
    }
  }

  const matched = cacheRows.filter((row) => row.status === "matched").length;
  const noMatch = cacheRows.filter((row) => row.status === "no_match").length;
  const ambiguous = cacheRows.filter((row) => row.status === "ambiguous").length;
  const noSyncRecord = products.filter(
    (product) => !cacheByProductId.has(product.id),
  ).length;

  const coverage = games.map((game) => {
    const gameProducts = productsByGameId.get(game.id) ?? [];
    const gameCache = cacheByGameId.get(game.id) ?? [];
    const universeId = universeIds[game.id] ?? null;
    const productCount = gameProducts.length;
    const cacheRowCount = gameCache.length;
    let configurationStatus: GameConfigurationStatus = universeId
      ? "configured"
      : "not_configured";
    if (productCount === 0) configurationStatus = "no_products";
    else if (universeId && cacheRowCount === 0) configurationStatus = "no_cache_activity";

    return {
      gameId: game.id,
      gameName: game.name,
      universeId,
      configurationStatus,
      productCount,
      cacheRowCount,
      matchedCount: gameCache.filter((row) => row.status === "matched").length,
      noMatchCount: gameCache.filter((row) => row.status === "no_match").length,
      ambiguousCount: gameCache.filter((row) => row.status === "ambiguous").length,
      noSyncRecordCount: gameProducts.filter(
        (product) => !cacheByProductId.has(product.id),
      ).length,
      latestVerifiedAt: maxDate(gameCache.map((row) => row.last_verified_at)),
      latestSyncLogAt: latestLogByGameId.get(game.id)?.synced_at ?? null,
    };
  });

  const logsWithGameNames = logs.map((log) => ({
    id: log.id,
    gameId: log.game_id,
    gameName: gameById.get(log.game_id)?.name ?? "Missing game",
    universeId: log.roblox_universe_id,
    syncedAt: log.synced_at,
    unchangedCount: log.unchanged_count,
    newCount: log.new_count,
    renamedCount: log.renamed_count,
    removedCount: log.removed_count,
    thumbnailUrlChangedCount: log.artwork_updated_count,
    ambiguousCount: log.ambiguous_count,
    noMatchCount: log.no_match_count,
    detailsJson: stringifyDetail(log.details),
    detailCount: safeDetailsArray(log.details).length,
  }));

  const recentChanges = logs.flatMap((log) => {
    const gameName = gameById.get(log.game_id)?.name ?? "Missing game";
    return safeDetailsArray(log.details).map((detail, index) => {
      const type = stringValue(detail.type) ?? "unknown";
      const previousValue =
        stringValue(detail.before) ?? stringValue(detail.previous) ?? null;
      const newValue =
        stringValue(detail.after) ?? stringValue(detail.new) ?? null;
      return {
        id: `${log.id}-${index}`,
        logId: log.id,
        gameId: log.game_id,
        gameName,
        universeId: log.roblox_universe_id,
        detectedAt: log.synced_at,
        type,
        label: changeLabel(type),
        productName: stringValue(detail.product),
        robloxPassName: stringValue(detail.roblox_name) ?? stringValue(detail.name),
        robloxGamePassId:
          numberValue(detail.roblox_gamepass_id) ?? numberValue(detail.id),
        previousValue,
        newValue,
        rawJson: stringifyDetail(detail),
      };
    });
  });

  const matchReview = products.map((product) => {
    const game = gameById.get(product.game_id);
    const cache = cacheByProductId.get(product.id);
    const override = overrideByProductId.get(product.id);
    const universeId = universeIds[product.game_id] ?? null;

    let matchStatus: MatchStatus = "no_sync_record";
    if (cache?.status === "matched") matchStatus = "matched";
    else if (cache?.status === "no_match") matchStatus = "no_match";
    else if (cache?.status === "ambiguous") matchStatus = "ambiguous";

    let renderedArtworkSource: RenderedArtworkSource = "placeholder";
    if (override?.source === "manual") renderedArtworkSource = "manual_override";
    else if (override?.source === "placeholder") renderedArtworkSource = "forced_placeholder";
    else if (cache?.status === "matched" && cache.icon_url) {
      renderedArtworkSource = "roblox_cache";
    }

    return {
      productId: product.id,
      productName: product.name,
      gameId: product.game_id,
      gameName: game?.name ?? "Missing game",
      universeId,
      configurationStatus: universeId
        ? ("configured" as const)
        : ("not_configured" as const),
      matchStatus,
      cachedSource: cache?.source ?? null,
      matchedRobloxPassName: cache?.matched_name ?? null,
      robloxGamePassId: cache?.roblox_gamepass_id ?? null,
      candidateCount: cache?.candidate_count ?? null,
      lastVerifiedAt: cache?.last_verified_at ?? null,
      firstFlaggedAt: cache?.first_flagged_at ?? null,
      renderedArtworkSource,
      candidateDetailsAvailable: false,
    };
  });

  const changeTypeOptions = [
    ...new Map(
      recentChanges.map((event) => [event.type, { value: event.type, label: event.label }]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

  return {
    summary: {
      storeGames: games.length,
      configuredSyncGames: Object.keys(universeIds).filter((id) =>
        games.some((game) => game.id === id),
      ).length,
      gamesWithoutUniverseConfig: games.filter((game) => !universeIds[game.id]).length,
      storefrontProducts: products.length,
      cacheRecords: cacheRows.length,
      matched,
      noMatch,
      ambiguous,
      noSyncRecord,
      manualOverrides: overrides.filter((override) => override.source === "manual").length,
      forcedPlaceholders: overrides.filter((override) => override.source === "placeholder").length,
      latestSyncActivity: maxDate(logs.map((log) => log.synced_at)),
    },
    coverage,
    latestWindow: inferLatestWindow(logs),
    recentLogs: logsWithGameNames,
    recentChanges,
    matchReview,
    gameOptions: games.map((game) => ({ id: game.id, name: game.name })),
    changeTypeOptions,
    limitations: [
      "The current schema stores one log row per game and has no global sync-run identifier.",
      "Failed sync attempts, trigger source, run duration, and admin identity are not stored.",
      "Ambiguous candidate IDs and candidate artwork are not stored.",
      "Thumbnail URL changed is a legacy icon_url comparison, not a stable Roblox asset identifier.",
    ],
  };
}
