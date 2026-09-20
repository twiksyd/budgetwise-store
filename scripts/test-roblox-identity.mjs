// Fixture tests for the shared Roblox identity loader
// (src/lib/roblox-identity-core.mjs, scripts/lib/roblox-identity-source.mjs)
// and its write-job consumers. No real database or Roblox access: fake
// Supabase clients, a stubbed fetch, and child processes pointed at a closed
// localhost port.
//
// Run with: node --test scripts/test-roblox-identity.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  RobloxIdentityError,
  buildRobloxIdentityFromDbRows,
  buildRobloxIdentityFromJson,
  classifyGameRobloxIdentity,
  fetchRobloxIdentityRows,
  resolveRobloxIdentitySource,
} from "../src/lib/roblox-identity-core.mjs";
import {
  loadRobloxIdentityForScript,
  loadVerifiedUniverseIds,
} from "./lib/roblox-identity-source.mjs";
import { resolveDeterministic } from "./lib/roblox-icon-resolver.mjs";

const JSON_PATH = "src/config/roblox-universe-ids.json";
const JSON_MAPPINGS = JSON.parse(readFileSync(JSON_PATH, "utf8"));

// Live production shape (064 seed), by game id.
const NOT_ROBLOX = [
  "cc1ec858-663c-4ff2-9185-e3d587780b46", // ROBUX PLUS
  "bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75", // Robux Sell — Covered Tax
  "e5318653-6b19-417c-9f89-1a7baa2331aa", // Robux Sell — No Tax
];
const NEEDS_REVIEW = [
  "c1855e24-3f0b-4f18-b97f-508f51df2f3f", // Build a ring farm
  "49b001cd-30a1-4062-a564-b78f646fb2fa", // Evomon
  "3a0172bd-0594-414a-af6e-50fba7172f03", // Gakuran
  "2570b17e-6df8-4c31-88f2-ed119f7eb51e", // Redliner
  "9e061a43-d4e2-4375-bdb0-d4f371d35fe7", // Strongest Battlegrounds
  "a74ef492-4241-477e-9761-526533d0ae06", // Survive the Apocalypse
];
const BLOX_BURG = "ba8427f2-95bf-4a4c-b1ba-8c7709448c15"; // hidden, no row
const DRAG_SIMULATOR = "1e6a23e2-e6a5-4d2b-a685-b33c943bcf5a"; // hidden, no row
const LEGACY_ROBUX_SELL = "f67125ef-5a16-4e7d-83c0-ec375cfb1f53"; // hidden, no row
const ROBUX_VIA_LINK_COVERED_TAX = NOT_ROBLOX[1];
const [VERIFIED_GAME, VERIFIED_UNIVERSE] = Object.entries(JSON_MAPPINGS)[0];

const PRODUCTION_ROWS = [
  ...Object.entries(JSON_MAPPINGS).map(([game_id, universeId]) => ({
    game_id,
    status: "verified",
    universe_id: String(universeId),
  })),
  ...NOT_ROBLOX.map((game_id) => ({ game_id, status: "not_roblox", universe_id: null })),
  ...NEEDS_REVIEW.map((game_id) => ({ game_id, status: "needs_review", universe_id: null })),
];

// Records every call; exposes no write methods, so any write attempt throws.
function fakeIdentityClient(result, calls = []) {
  const builder = {
    select(columns, options) {
      calls.push(["select", columns, options]);
      return builder;
    },
    order(column) {
      calls.push(["order", column]);
      return typeof result === "function" ? result() : Promise.resolve(result);
    },
  };
  return {
    from(table) {
      calls.push(["from", table]);
      return builder;
    },
  };
}

const failingClient = () =>
  fakeIdentityClient({ data: null, error: { message: "permission denied for table game_roblox_identity" }, count: null });

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

test("ROBLOX_IDENTITY_SOURCE defaults to json and accepts only json or db", () => {
  assert.equal(resolveRobloxIdentitySource(undefined), "json");
  assert.equal(resolveRobloxIdentitySource(""), "json");
  assert.equal(resolveRobloxIdentitySource("json"), "json");
  assert.equal(resolveRobloxIdentitySource("db"), "db");
  for (const invalid of ["DB", "Json", " db", "database", "xob", "true"]) {
    assert.throws(() => resolveRobloxIdentitySource(invalid), /Invalid ROBLOX_IDENTITY_SOURCE/);
  }
});

// ---------------------------------------------------------------------------
// json mode
// ---------------------------------------------------------------------------

test("json mode: the same 26 trusted mappings, unchanged", async () => {
  const identity = await loadRobloxIdentityForScript({ env: {} });
  assert.equal(identity.source, "json");
  assert.deepEqual(identity.counts, { verified: 26, not_roblox: 0, needs_review: 0 });
  assert.deepEqual(identity.verifiedUniverseIds(), JSON_MAPPINGS);
  assert.deepEqual(await loadVerifiedUniverseIds({ env: { ROBLOX_IDENTITY_SOURCE: "json" } }), JSON_MAPPINGS);
  for (const [gameId, universeId] of Object.entries(JSON_MAPPINGS)) {
    assert.equal(identity.getStatus(gameId), "verified");
    assert.equal(identity.getVerifiedUniverseId(gameId), universeId);
  }
});

test("json mode: unmapped games are unreviewed with no universe, as before", () => {
  const identity = buildRobloxIdentityFromJson(JSON_MAPPINGS);
  for (const gameId of [...NOT_ROBLOX, ...NEEDS_REVIEW, BLOX_BURG, LEGACY_ROBUX_SELL]) {
    assert.equal(identity.getStatus(gameId), "unreviewed");
    assert.equal(identity.getVerifiedUniverseId(gameId), null);
  }
});

test("json mode: ambiguous config is rejected", async () => {
  const dup = `{"${VERIFIED_GAME}": 1, "${VERIFIED_GAME}": 2}`;
  await assert.rejects(
    loadRobloxIdentityForScript({ env: { ROBLOX_IDENTITY_SOURCE: "json" }, readJsonText: () => dup }),
    /duplicate game id/,
  );
  assert.throws(() => buildRobloxIdentityFromJson({ [VERIFIED_GAME]: 7, [BLOX_BURG]: 7 }), /mapped to both/);
  assert.throws(() => buildRobloxIdentityFromJson({ [VERIFIED_GAME]: 0 }), /positive integer/);
});

// ---------------------------------------------------------------------------
// db mode
// ---------------------------------------------------------------------------

test("db mode: verified mappings are identical to json; 3 not_roblox; 6 needs_review", async () => {
  const calls = [];
  const client = fakeIdentityClient({ data: PRODUCTION_ROWS, error: null, count: PRODUCTION_ROWS.length }, calls);
  const db = await loadRobloxIdentityForScript({ supabase: client, env: { ROBLOX_IDENTITY_SOURCE: "db" } });
  const json = await loadRobloxIdentityForScript({ env: { ROBLOX_IDENTITY_SOURCE: "json" } });

  assert.equal(db.source, "db");
  assert.deepEqual(db.counts, { verified: 26, not_roblox: 3, needs_review: 6 });
  assert.deepEqual(db.verifiedUniverseIds(), json.verifiedUniverseIds());
  assert.equal(JSON.stringify(db.verifiedUniverseIds()), JSON.stringify(json.verifiedUniverseIds()));
  assert.deepEqual(db.gameIdsWithStatus("not_roblox"), [...NOT_ROBLOX].sort());
  assert.deepEqual(db.gameIdsWithStatus("needs_review"), [...NEEDS_REVIEW].sort());

  // Read-only: one SELECT of the identity table, nothing else.
  assert.deepEqual(calls, [
    ["from", "game_roblox_identity"],
    ["select", "game_id, status, universe_id:universe_id::text", { count: "exact" }],
    ["order", "game_id"],
  ]);
});

test("db mode: needs_review and not_roblox rows never yield a universe id", () => {
  const db = buildRobloxIdentityFromDbRows(PRODUCTION_ROWS);
  for (const gameId of NEEDS_REVIEW) {
    assert.equal(db.getStatus(gameId), "needs_review");
    assert.equal(db.getVerifiedUniverseId(gameId), null);
    assert.equal(db.isVerified(gameId), false);
  }
  for (const gameId of NOT_ROBLOX) {
    assert.equal(db.getStatus(gameId), "not_roblox");
    assert.equal(db.getVerifiedUniverseId(gameId), null);
  }
  assert.equal(Object.hasOwn(db.verifiedUniverseIds(), NEEDS_REVIEW[0]), false);
});

test("db mode: Blox Burg, Drag Simulator, and legacy Robux Sell are unreviewed", () => {
  const db = buildRobloxIdentityFromDbRows(PRODUCTION_ROWS);
  for (const gameId of [BLOX_BURG, DRAG_SIMULATOR, LEGACY_ROBUX_SELL]) {
    assert.equal(db.getStatus(gameId), "unreviewed");
    assert.equal(db.getVerifiedUniverseId(gameId), null);
  }
});

test("db mode: malformed or contradictory rows are rejected, not skipped", () => {
  const row = (overrides) => [{ game_id: VERIFIED_GAME, status: "verified", universe_id: "5", ...overrides }];
  assert.throws(() => buildRobloxIdentityFromDbRows(row({ status: "maybe" })), /unknown status/);
  assert.throws(() => buildRobloxIdentityFromDbRows(row({ universe_id: null })), /not a positive integer/);
  assert.throws(() => buildRobloxIdentityFromDbRows(row({ universe_id: "9007199254740993" })), /safe integer/);
  assert.throws(() => buildRobloxIdentityFromDbRows(row({ status: "needs_review" })), /unexpectedly carries/);
  assert.throws(() => buildRobloxIdentityFromDbRows(row({ game_id: "not-a-uuid" })), /invalid game_id/);
  assert.throws(
    () => buildRobloxIdentityFromDbRows([...row({}), ...row({})]),
    /more than once/,
  );
  assert.throws(
    () => buildRobloxIdentityFromDbRows([...row({}), { game_id: BLOX_BURG, status: "verified", universe_id: "5" }]),
    /verified for both/,
  );
});

test("db mode: a failed or partial query throws and never falls back to json", async () => {
  let jsonRead = false;
  const readJsonText = () => {
    jsonRead = true;
    return readFileSync(JSON_PATH, "utf8");
  };

  await assert.rejects(
    loadVerifiedUniverseIds({ supabase: failingClient(), env: { ROBLOX_IDENTITY_SOURCE: "db" }, readJsonText }),
    (error) => error instanceof RobloxIdentityError && /permission denied/.test(error.message),
  );
  await assert.rejects(
    fetchRobloxIdentityRows(fakeIdentityClient(() => Promise.reject(new TypeError("fetch failed")))),
    /game_roblox_identity read failed: fetch failed/,
  );
  await assert.rejects(
    fetchRobloxIdentityRows(fakeIdentityClient({ data: PRODUCTION_ROWS.slice(1), error: null, count: 35 })),
    /refusing a partial identity view/,
  );
  await assert.rejects(
    loadRobloxIdentityForScript({ env: { ROBLOX_IDENTITY_SOURCE: "db" }, readJsonText }),
    /requires a Supabase client/,
  );
  await assert.rejects(
    loadRobloxIdentityForScript({ env: { ROBLOX_IDENTITY_SOURCE: "DB" }, readJsonText }),
    /Invalid ROBLOX_IDENTITY_SOURCE/,
  );
  assert.equal(jsonRead, false);
});

// ---------------------------------------------------------------------------
// Catalog health classification
// ---------------------------------------------------------------------------

test("health json mode reproduces the legacy configured / special route / not configured rules", () => {
  const json = buildRobloxIdentityFromJson(JSON_MAPPINGS);
  const classify = (gameId, extra = {}) =>
    classifyGameRobloxIdentity(json, { gameId, gameHidden: false, specialStoreRoute: false, ...extra });

  assert.deepEqual(classify(VERIFIED_GAME), {
    configurationStatus: "configured",
    universeId: VERIFIED_UNIVERSE,
    legacyMappingChecks: false,
    skipSyncDiagnostics: false,
    identityIssue: null,
  });
  assert.deepEqual(classify(ROBUX_VIA_LINK_COVERED_TAX, { gameHidden: true, specialStoreRoute: true }), {
    configurationStatus: "special_store_route",
    universeId: null,
    legacyMappingChecks: false,
    skipSyncDiagnostics: true,
    identityIssue: null,
  });
  assert.deepEqual(classify(NEEDS_REVIEW[0]), {
    configurationStatus: "not_configured",
    universeId: null,
    legacyMappingChecks: true,
    skipSyncDiagnostics: false,
    identityIssue: null,
  });
});

test("health db mode: verified is configured with no identity issue", () => {
  const db = buildRobloxIdentityFromDbRows(PRODUCTION_ROWS);
  const result = classifyGameRobloxIdentity(db, { gameId: VERIFIED_GAME, gameHidden: false, specialStoreRoute: false });
  assert.equal(result.configurationStatus, "configured");
  assert.equal(result.universeId, VERIFIED_UNIVERSE);
  assert.equal(result.identityIssue, null);
  assert.equal(result.legacyMappingChecks, false);
});

test("health db mode: not_roblox raises no missing-mapping, sync, or identity warning", () => {
  const db = buildRobloxIdentityFromDbRows(PRODUCTION_ROWS);
  for (const [gameId, gameHidden] of [[NOT_ROBLOX[0], false], [NOT_ROBLOX[1], true]]) {
    assert.deepEqual(classifyGameRobloxIdentity(db, { gameId, gameHidden, specialStoreRoute: false }), {
      configurationStatus: "not_roblox",
      universeId: null,
      legacyMappingChecks: false,
      skipSyncDiagnostics: true,
      identityIssue: null,
    });
  }
});

test("health db mode: needs_review warns for visible games, stays quiet for hidden ones", () => {
  const db = buildRobloxIdentityFromDbRows(PRODUCTION_ROWS);
  const visible = classifyGameRobloxIdentity(db, { gameId: NEEDS_REVIEW[0], gameHidden: false, specialStoreRoute: false });
  assert.equal(visible.configurationStatus, "needs_review");
  assert.equal(visible.identityIssue, "needs_review");
  assert.equal(visible.legacyMappingChecks, false);
  const hidden = classifyGameRobloxIdentity(db, { gameId: NEEDS_REVIEW[0], gameHidden: true, specialStoreRoute: false });
  assert.equal(hidden.identityIssue, null);
});

test("health db mode: a missing row warns only when the game is visible", () => {
  const db = buildRobloxIdentityFromDbRows(PRODUCTION_ROWS);
  const newVisibleGame = "aaaaaaaa-0000-4000-8000-000000000001";
  const visible = classifyGameRobloxIdentity(db, { gameId: newVisibleGame, gameHidden: false, specialStoreRoute: false });
  assert.equal(visible.configurationStatus, "unreviewed");
  assert.equal(visible.identityIssue, "not_reviewed");

  for (const hiddenGame of [BLOX_BURG, DRAG_SIMULATOR, LEGACY_ROBUX_SELL]) {
    const hidden = classifyGameRobloxIdentity(db, { gameId: hiddenGame, gameHidden: true, specialStoreRoute: false });
    assert.equal(hidden.configurationStatus, "unreviewed");
    assert.equal(hidden.identityIssue, null);
    assert.equal(hidden.legacyMappingChecks, false);
  }
});

test("health db mode: hard-coded pseudo-game ids do not decide identity", () => {
  const rowsWithoutViaLink = PRODUCTION_ROWS.filter((row) => row.game_id !== ROBUX_VIA_LINK_COVERED_TAX);
  const db = buildRobloxIdentityFromDbRows(rowsWithoutViaLink);
  const result = classifyGameRobloxIdentity(db, {
    gameId: ROBUX_VIA_LINK_COVERED_TAX,
    gameHidden: false,
    specialStoreRoute: true,
  });
  assert.equal(result.configurationStatus, "unreviewed");
  assert.equal(result.identityIssue, "not_reviewed");
});

test("health: an unavailable identity source claims nothing and raises no per-game issue", () => {
  assert.deepEqual(
    classifyGameRobloxIdentity(null, { gameId: VERIFIED_GAME, gameHidden: false, specialStoreRoute: false }),
    {
      configurationStatus: "not_available",
      universeId: null,
      legacyMappingChecks: false,
      skipSyncDiagnostics: true,
      identityIssue: null,
    },
  );
});

// ---------------------------------------------------------------------------
// Deterministic resolver
// ---------------------------------------------------------------------------

test("deterministic resolver in db mode touches verified games only and never reaches fuzzy search", async () => {
  const db = buildRobloxIdentityFromDbRows(PRODUCTION_ROWS);
  const games = [
    { id: VERIFIED_GAME, name: "Verified game", icon_url: null },
    { id: NEEDS_REVIEW[4], name: "Strongest Battlegrounds", icon_url: null },
    { id: NOT_ROBLOX[0], name: "ROBUX PLUS", icon_url: null },
    { id: BLOX_BURG, name: "Blox Burg", icon_url: null },
  ];
  const updates = [];
  const supabase = {
    from(table) {
      assert.equal(table, "games");
      return {
        select: () => ({ is: async () => ({ data: games, error: null }) }),
        update: (values) => ({
          eq: async (column, id) => {
            updates.push({ column, id, values });
            return { error: null };
          },
        }),
      };
    },
  };

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return { ok: true, json: async () => ({ data: [{ imageUrl: "https://tr.rbxcdn.com/icon.png" }] }) };
  };

  try {
    const result = await resolveDeterministic({ supabase, universeIds: db.verifiedUniverseIds() });
    assert.deepEqual(result.updated.map((game) => game.name), ["Verified game"]);
    assert.deepEqual(result.skippedNoMapping, ["Strongest Battlegrounds", "ROBUX PLUS", "Blox Burg"]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(updates, [
    { column: "id", id: VERIFIED_GAME, values: { icon_url: "https://tr.rbxcdn.com/icon.png" } },
  ]);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], new RegExp(`^https://thumbnails\\.roblox\\.com/.*universeIds=${VERIFIED_UNIVERSE}&`));
  assert.equal(fetchCalls.some((url) => /search/i.test(url)), false);
});

test("deterministic path has no route to the fuzzy helpers", () => {
  const source = resolveDeterministic.toString();
  assert.equal(/searchRoblox|findConfidentMatch|normalize\(/.test(source), false);

  const script = readFileSync("scripts/backfill-game-icons-deterministic.mjs", "utf8");
  const resolverImport = script.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/lib\/roblox-icon-resolver\.mjs"/);
  assert.ok(resolverImport, "deterministic script must import from the resolver module");
  assert.deepEqual(resolverImport[1].split(",").map((name) => name.trim()).filter(Boolean), ["resolveDeterministic"]);
});

// ---------------------------------------------------------------------------
// Write jobs fail closed (real scripts, unreachable database)
// ---------------------------------------------------------------------------

function runScript(script, env, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-key",
      ...env,
    },
  });
}

for (const script of ["scripts/backfill-game-icons-deterministic.mjs", "scripts/sync-roblox-gamepasses.mjs"]) {
  test(`${script}: db identity query failure exits non-zero before any write`, () => {
    const result = runScript(script, { ROBLOX_IDENTITY_SOURCE: "db" });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /game_roblox_identity read failed/);
    assert.doesNotMatch(result.stdout, /Updated|=== |Target .*\n.*Roblox identity source: json/);
  });

  test(`${script}: invalid ROBLOX_IDENTITY_SOURCE fails clearly`, () => {
    const result = runScript(script, { ROBLOX_IDENTITY_SOURCE: "database" });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Invalid ROBLOX_IDENTITY_SOURCE "database"/);
  });
}

// ---------------------------------------------------------------------------
// Parity gate
// ---------------------------------------------------------------------------

test("parity checker exits 0 on parity and 1 on drift", () => {
  const dir = mkdtempSync(join(tmpdir(), "roblox-identity-parity-"));
  const verifiedRows = PRODUCTION_ROWS.filter((row) => row.status === "verified")
    .map(({ game_id, universe_id }) => ({ game_id, universe_id }));

  const okFile = join(dir, "ok.json");
  writeFileSync(okFile, JSON.stringify(verifiedRows));
  const ok = runScript("scripts/check-roblox-identity-parity.mjs", {}, ["--db-rows-file", okFile]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /Parity OK/);

  const driftFile = join(dir, "drift.json");
  writeFileSync(driftFile, JSON.stringify([...verifiedRows.slice(1), { game_id: BLOX_BURG, universe_id: "1" }]));
  const drift = runScript("scripts/check-roblox-identity-parity.mjs", {}, ["--db-rows-file", driftFile]);
  assert.equal(drift.status, 1, drift.stdout + drift.stderr);
  assert.match(drift.stdout, /Parity FAILED/);
});

test("daily workflow gates the deterministic resolver on the DB preflight, not JSON parity", () => {
  const workflow = readFileSync(".github/workflows/roblox-icon-backfill.yml", "utf8");
  const runLines = workflow.split("\n").filter((line) => /^\s*run:/.test(line)).map((line) => line.trim());
  const preflightIndex = runLines.indexOf("run: npm run db:check-roblox-identity-db-preflight");
  const resolverIndex = runLines.indexOf("run: node scripts/backfill-game-icons-deterministic.mjs");

  assert.notEqual(preflightIndex, -1);
  assert.notEqual(resolverIndex, -1);
  assert.ok(preflightIndex < resolverIndex, "DB preflight must run before the resolver");
  assert.equal(
    runLines.some((line) => line === "run: npm run db:check-roblox-identity-parity"),
    false,
    "JSON parity must no longer gate the daily resolver",
  );
  assert.equal(runLines.some((line) => /backfill-game-icons\.mjs|sync-roblox-gamepasses/.test(line)), false);
  assert.doesNotMatch(workflow, /continue-on-error|if:\s*\$?\{?\{?\s*always\(\)/);
  assert.match(workflow, /ROBLOX_IDENTITY_SOURCE: \$\{\{ vars\.ROBLOX_IDENTITY_SOURCE \|\| 'json' \}\}/);

  // CI has no .env.local, so the npm script must tolerate its absence.
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["db:check-roblox-identity-db-preflight"], /--env-file-if-exists=\.env\.local/);
});

// ---------------------------------------------------------------------------
// No consumer bypasses the loader
// ---------------------------------------------------------------------------

test("only the loader, parity, and generator tooling read the JSON config directly", () => {
  const allowed = new Set([
    "src/config/roblox-universe-ids.ts",
    "src/lib/queries/roblox-identity.ts",
    "scripts/lib/roblox-identity-parity.mjs",
    "scripts/lib/roblox-identity-source.mjs",
    "scripts/check-roblox-identity-parity.mjs",
    "scripts/generate-roblox-identity-seed.mjs",
    "scripts/test-roblox-identity-parity.mjs",
    "scripts/test-roblox-identity.mjs",
  ]);
  const pattern = /roblox-universe-ids(\.json|\.ts)?["'`]|TRUSTED_MAPPINGS_PATH/;

  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.(ts|tsx|mjs|js)$/.test(entry.name) ? [path] : [];
    });

  const offenders = [...walk("src"), ...walk("scripts")]
    .map((path) => relative(".", path).replaceAll("\\", "/"))
    .filter((path) => !allowed.has(path))
    .filter((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .some((line) => !/^\s*(\/\/|\*)/.test(line) && pattern.test(line)),
    );

  assert.deepEqual(offenders, []);
});
