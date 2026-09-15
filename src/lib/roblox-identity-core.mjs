// Shared, read-only Roblox game identity core.
//
// One abstraction over the two identity sources used during the identity
// rollout:
//   json  src/config/roblox-universe-ids.json (legacy Store config, default)
//   db    XOB public.game_roblox_identity
//
// Callers never see raw rows. They get a RobloxIdentity snapshot answering
// two questions: what is a game's identity status, and what is its verified
// universe id (null unless verified).
//
// No imports and no environment access here: the JSON object and the
// Supabase client are injected, so the Next.js server loader
// (src/lib/queries/roblox-identity.ts), the script loader
// (scripts/lib/roblox-identity-source.mjs), and the fixture tests all run the
// same implementation. Plain .mjs for the same reason as order-access.mjs.
//
// This module only ever SELECTs. The Store's service-role key has SELECT and
// nothing else on game_roblox_identity (XOB migration 063).

export const ROBLOX_IDENTITY_SOURCES = Object.freeze(["json", "db"]);
export const DEFAULT_ROBLOX_IDENTITY_SOURCE = "json";

const DB_STATUSES = new Set(["verified", "not_roblox", "needs_review"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

export class RobloxIdentityError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RobloxIdentityError";
  }
}

// Unset or blank means the default (json). Anything else must be exactly
// "json" or "db": a typo must never silently pick a source.
export function resolveRobloxIdentitySource(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return DEFAULT_ROBLOX_IDENTITY_SOURCE;
  }
  if (ROBLOX_IDENTITY_SOURCES.includes(rawValue)) return rawValue;
  throw new RobloxIdentityError(
    `Invalid ROBLOX_IDENTITY_SOURCE ${JSON.stringify(rawValue)}: expected "json" or "db"`,
  );
}

function toUniverseId(value, gameId) {
  const text =
    typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : null) : value;
  if (typeof text !== "string" || !POSITIVE_INTEGER_PATTERN.test(text)) {
    throw new RobloxIdentityError(`Universe id for ${gameId} is not a positive integer: ${value}`);
  }
  const universeId = Number(text);
  if (!Number.isSafeInteger(universeId)) {
    throw new RobloxIdentityError(`Universe id for ${gameId} exceeds the safe integer range: ${text}`);
  }
  return universeId;
}

function createIdentity(source, statusByGameId, universeIdByGameId) {
  const counts = { verified: 0, not_roblox: 0, needs_review: 0 };
  for (const status of statusByGameId.values()) counts[status] += 1;

  return Object.freeze({
    source,
    counts: Object.freeze(counts),
    getStatus(gameId) {
      return statusByGameId.get(gameId) ?? "unreviewed";
    },
    getVerifiedUniverseId(gameId) {
      return universeIdByGameId.get(gameId) ?? null;
    },
    isVerified(gameId) {
      return universeIdByGameId.has(gameId);
    },
    gameIdsWithStatus(status) {
      return [...statusByGameId]
        .filter(([, value]) => value === status)
        .map(([gameId]) => gameId)
        .sort();
    },
    // A fresh Record<gameId, universeId> copy: the shape the legacy JSON
    // config had, so script consumers need minimal change.
    verifiedUniverseIds() {
      return Object.fromEntries(
        [...universeIdByGameId].sort(([a], [b]) => a.localeCompare(b)),
      );
    },
  });
}

// JSON mode. Every mapped game is verified; every other game is unreviewed,
// because the JSON config has no way to say not_roblox or needs_review.
export function buildRobloxIdentityFromJson(mappings) {
  if (mappings === null || typeof mappings !== "object" || Array.isArray(mappings)) {
    throw new RobloxIdentityError("Roblox universe id config must be an object of gameId -> universeId");
  }

  const statusByGameId = new Map();
  const universeIdByGameId = new Map();
  const gameByUniverseId = new Map();

  for (const [gameId, value] of Object.entries(mappings)) {
    if (!UUID_PATTERN.test(gameId)) {
      throw new RobloxIdentityError(`Roblox universe id config key is not a lowercase UUID: ${gameId}`);
    }
    const universeId = toUniverseId(value, gameId);
    if (gameByUniverseId.has(universeId)) {
      throw new RobloxIdentityError(
        `Universe ${universeId} is mapped to both ${gameByUniverseId.get(universeId)} and ${gameId}`,
      );
    }
    gameByUniverseId.set(universeId, gameId);
    statusByGameId.set(gameId, "verified");
    universeIdByGameId.set(gameId, universeId);
  }

  return createIdentity("json", statusByGameId, universeIdByGameId);
}

// DB mode. Rows are validated strictly; anything ambiguous throws rather than
// being skipped, so callers fail closed instead of acting on a partial view.
export function buildRobloxIdentityFromDbRows(rows) {
  if (!Array.isArray(rows)) {
    throw new RobloxIdentityError("game_roblox_identity rows must be an array");
  }

  const statusByGameId = new Map();
  const universeIdByGameId = new Map();
  const gameByUniverseId = new Map();

  for (const row of rows) {
    const gameId = row?.game_id;
    if (typeof gameId !== "string" || !UUID_PATTERN.test(gameId)) {
      throw new RobloxIdentityError(`game_roblox_identity row has an invalid game_id: ${JSON.stringify(row)}`);
    }
    if (statusByGameId.has(gameId)) {
      throw new RobloxIdentityError(`game_roblox_identity returned game ${gameId} more than once`);
    }
    if (!DB_STATUSES.has(row.status)) {
      throw new RobloxIdentityError(`game_roblox_identity row for ${gameId} has an unknown status: ${row.status}`);
    }

    if (row.status === "verified") {
      const universeId = toUniverseId(row.universe_id, gameId);
      if (gameByUniverseId.has(universeId)) {
        throw new RobloxIdentityError(
          `Universe ${universeId} is verified for both ${gameByUniverseId.get(universeId)} and ${gameId}`,
        );
      }
      gameByUniverseId.set(universeId, gameId);
      universeIdByGameId.set(gameId, universeId);
    } else if (row.universe_id !== null && row.universe_id !== undefined) {
      // 063's shape check forbids this; refuse rather than guess which half is right.
      throw new RobloxIdentityError(`${row.status} row for ${gameId} unexpectedly carries a universe_id`);
    }

    statusByGameId.set(gameId, row.status);
  }

  return createIdentity("db", statusByGameId, universeIdByGameId);
}

// The one identity query, shared by the app and scripts. universe_id is read
// as text (it is a bigint) and the exact count is checked, so a truncated
// result is an error rather than silently missing games.
export async function fetchRobloxIdentityRows(supabase) {
  let result;
  try {
    result = await supabase
      .from("game_roblox_identity")
      .select("game_id, status, universe_id:universe_id::text", { count: "exact" })
      .order("game_id");
  } catch (error) {
    throw new RobloxIdentityError(
      `game_roblox_identity read failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const { data, error, count } = result ?? {};
  if (error) {
    throw new RobloxIdentityError(`game_roblox_identity read failed: ${error.message ?? String(error)}`, {
      cause: error,
    });
  }
  if (!Array.isArray(data)) {
    throw new RobloxIdentityError("game_roblox_identity read returned no data");
  }
  if (typeof count === "number" && data.length !== count) {
    throw new RobloxIdentityError(
      `Read ${data.length} of ${count} game_roblox_identity rows; refusing a partial identity view`,
    );
  }
  return data;
}

export async function loadRobloxIdentityFromDb(supabase) {
  return buildRobloxIdentityFromDbRows(await fetchRobloxIdentityRows(supabase));
}

// Catalog-health classification for one game.
//
// identity === null means the configured source could not be read: nothing
// is claimed about the game and no identity issue is raised.
//
// json mode reproduces the legacy rules exactly (including the hard-coded
// Robux Via Link special route). db mode derives everything from identity
// status and ignores specialStoreRoute, so no pseudo-game id decides identity.
export function classifyGameRobloxIdentity(identity, { gameId, gameHidden, specialStoreRoute }) {
  if (!identity) {
    return {
      configurationStatus: "not_available",
      universeId: null,
      legacyMappingChecks: false,
      skipSyncDiagnostics: true,
      identityIssue: null,
    };
  }

  const universeId = identity.getVerifiedUniverseId(gameId);

  if (identity.source === "json") {
    return {
      configurationStatus: specialStoreRoute
        ? "special_store_route"
        : universeId
          ? "configured"
          : "not_configured",
      universeId,
      legacyMappingChecks: !universeId && !specialStoreRoute,
      skipSyncDiagnostics: Boolean(specialStoreRoute),
      identityIssue: null,
    };
  }

  const status = identity.getStatus(gameId);
  if (status === "verified") {
    return {
      configurationStatus: "configured",
      universeId,
      legacyMappingChecks: false,
      skipSyncDiagnostics: false,
      identityIssue: null,
    };
  }
  if (status === "not_roblox") {
    return {
      configurationStatus: "not_roblox",
      universeId: null,
      legacyMappingChecks: false,
      skipSyncDiagnostics: true,
      identityIssue: null,
    };
  }
  return {
    configurationStatus: status,
    universeId: null,
    legacyMappingChecks: false,
    skipSyncDiagnostics: false,
    // Hidden games stay quiet: a missing or unresolved identity on a game
    // customers cannot reach is not worth an operator warning.
    identityIssue: gameHidden ? null : status === "needs_review" ? "needs_review" : "not_reviewed",
  };
}
