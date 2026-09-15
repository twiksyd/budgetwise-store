// Shared, pure helpers for comparing the trusted Store Roblox identity config
// (src/config/roblox-universe-ids.json) against XOB's
// public.game_roblox_identity rows. No I/O here, so the comparison can be
// exercised against fixtures as well as a live or disposable database.
//
// Universe ids are compared as decimal strings: they are bigints in the
// database, and reading them as strings avoids any JavaScript number
// precision question.

export const TRUSTED_MAPPINGS_PATH = "src/config/roblox-universe-ids.json";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

// Parses roblox-universe-ids.json text into Map<gameId, universeId string>.
// Throws on anything that would make parity ambiguous: non-object JSON,
// duplicate keys (JSON.parse would silently keep the last one), non-UUID
// keys, non-positive or unsafe integer values, or a universe id mapped to
// more than one game.
export function parseTrustedMappings(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Trusted mappings must be a JSON object of gameId -> universeId");
  }

  const keyCount = [...jsonText.matchAll(/"([^"\\]*)"\s*:/g)].length;
  if (keyCount !== Object.keys(parsed).length) {
    throw new Error("Trusted mappings contain a duplicate game id key");
  }

  const mappings = new Map();
  const gameByUniverse = new Map();

  for (const [gameId, value] of Object.entries(parsed)) {
    if (!UUID_PATTERN.test(gameId)) {
      throw new Error(`Trusted mapping key is not a lowercase UUID: ${gameId}`);
    }
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Trusted mapping for ${gameId} is not a positive safe integer: ${value}`);
    }

    const universeId = String(value);
    if (gameByUniverse.has(universeId)) {
      throw new Error(
        `Universe ${universeId} is mapped to both ${gameByUniverse.get(universeId)} and ${gameId}`,
      );
    }

    gameByUniverse.set(universeId, gameId);
    mappings.set(gameId, universeId);
  }

  return mappings;
}

function normalizeUniverseId(value, gameId) {
  const text = typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : null) : value;
  if (typeof text !== "string" || !POSITIVE_INTEGER_PATTERN.test(text)) {
    throw new Error(`Database universe_id for ${gameId} is not a positive integer: ${value}`);
  }
  return text;
}

// Compares trusted mappings against verified identity rows
// ([{ game_id, universe_id }], universe_id as a string or safe integer).
// Parity means the exact same set of game ids with the exact same universe id
// per game.
export function compareIdentityParity(trustedMappings, verifiedRows) {
  const dbMappings = new Map();

  for (const row of verifiedRows) {
    if (typeof row?.game_id !== "string" || !UUID_PATTERN.test(row.game_id)) {
      throw new Error(`Database row has an invalid game_id: ${JSON.stringify(row)}`);
    }
    if (dbMappings.has(row.game_id)) {
      throw new Error(`Database returned game ${row.game_id} more than once`);
    }
    dbMappings.set(row.game_id, normalizeUniverseId(row.universe_id, row.game_id));
  }

  const missing_in_db = [];
  const universe_id_mismatch = [];
  for (const [gameId, universeId] of trustedMappings) {
    if (!dbMappings.has(gameId)) {
      missing_in_db.push({ game_id: gameId, json_universe_id: universeId });
    } else if (dbMappings.get(gameId) !== universeId) {
      universe_id_mismatch.push({
        game_id: gameId,
        json_universe_id: universeId,
        db_universe_id: dbMappings.get(gameId),
      });
    }
  }

  const extra_in_db = [];
  for (const [gameId, universeId] of dbMappings) {
    if (!trustedMappings.has(gameId)) {
      extra_in_db.push({ game_id: gameId, db_universe_id: universeId });
    }
  }

  const byGameId = (a, b) => a.game_id.localeCompare(b.game_id);
  missing_in_db.sort(byGameId);
  extra_in_db.sort(byGameId);
  universe_id_mismatch.sort(byGameId);

  return {
    ok: missing_in_db.length === 0 && extra_in_db.length === 0 && universe_id_mismatch.length === 0,
    json_count: trustedMappings.size,
    db_verified_count: dbMappings.size,
    missing_in_db,
    extra_in_db,
    universe_id_mismatch,
  };
}
