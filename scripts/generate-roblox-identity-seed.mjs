// Generates XOB migration 064_game_roblox_identity_seed.sql from the trusted
// Store Roblox identity sources:
//   - src/config/roblox-universe-ids.json  (the 26 reviewed mappings)
//   - src/config/roblox-universe-ids.ts    (their verification basis and the
//                                           "Deliberately NOT configured" list)
//
// Network access happens only here, at generation time, and only as reads:
// live public.games is SELECTed (service role) to pin each game id to its
// current name, and Roblox's public games API is read to snapshot each trusted
// universe's root place, name, and creator. The emitted SQL contains literals
// only and makes no network calls.
//
// Every Roblox response is validated strictly (HTTP 200 alone proves nothing:
// Roblox answers 200 with an empty list for unknown universes). Any failure
// stops generation and nothing is written, so a partial migration can never
// be produced.
//
// Dry run (prints every generated row, writes nothing):
//   node --env-file=.env.local scripts/generate-roblox-identity-seed.mjs
// Write the migration (refuses to overwrite an existing file):
//   node --env-file=.env.local scripts/generate-roblox-identity-seed.mjs --write <path>
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { TRUSTED_MAPPINGS_PATH, parseTrustedMappings } from "./lib/roblox-identity-parity.mjs";

const TS_PATH = "src/config/roblox-universe-ids.ts";
const SOURCE_REPOSITORY = "BudgetWise_Store";
const ROBLOX_GAMES_ENDPOINT = "https://games.roblox.com/v1/games";
const ROBLOX_BATCH_SIZE = 20;
const MIGRATION_NAME = "064_game_roblox_identity_seed.sql";

const EXPECTED_COUNTS = { verified: 26, not_roblox: 3, needs_review: 6 };
const EXPECTED_ORIGINAL_METHODS = { gamepass_overlap: 24, manual_content_icon_match: 1, owner_confirmed: 1 };

// The one owner-confirmed exception documented in roblox-universe-ids.ts.
// The TS file describes every other mapping as confirmed by exact game pass
// name overlap; PROVENANCE_CORRECTIONS records where commit history differs.
const OWNER_CONFIRMED = new Map([
  ["84372024-ee1c-43a0-bbfb-6227c43039d3", { universeId: "10648820673", rootPlaceId: "116497287371701" }],
]);

const METHOD_BASIS = {
  gamepass_overlap:
    "roblox-universe-ids.ts: confirmed with at least 2-3 (usually 5+) exact product-name overlaps against the live Roblox game pass list, never on name similarity alone",
  owner_confirmed:
    "roblox-universe-ids.ts: universe and root place ids confirmed directly by the store owner rather than by product-list cross-reference",
};

// Game-specific evidence already recorded in the Store source or its commit
// history. `quote` must appear verbatim in that source, so this list cannot
// drift from what was actually recorded.
const RECORDED_EVIDENCE = new Map([
  ["ec7b0020-d616-485b-a151-f5fc2d541c9b", [{
    file: TS_PATH,
    quote: "(Grappling Hook, Power Hose,",
    note: "Pilot entry. The top Roblox search result for Grow a Garden is a different, nearly-empty universe; this universe was confirmed by cross-referencing real product names (Grappling Hook, Power Hose, Vine Wrapper) against the candidate universes' game pass lists.",
  }]],
  ["3304b0e6-cbdd-4ddd-8232-d994a7d515cb", [{
    commit: "e696839",
    quote: "Slime RNG 7/7",
    note: "Full-catalog rollout: 7/7 exact game pass name overlap.",
  }]],
]);

// The roblox-universe-ids.ts statement that every non-Karinderya entry was
// confirmed by game pass overlap was first written before the two mappings
// below were added, so it cannot describe how they were established. Their
// introducing commits are the actual record; the evidence says exactly what
// those commits do and do not show. requiredQuotes / forbiddenQuotes are
// checked against the commit message so this cannot drift from history.
const LEGACY_OVERLAP_COMMENT = "Every entry currently in roblox-universe-ids.json was confirmed this way";

const PROVENANCE_CORRECTIONS = new Map([
  // Blox Fruits: established from description + icon evidence. Its game pass
  // matches were only found after the mapping was added.
  ["155d2360-c956-4982-9965-9a0b303d749e", {
    introducedIn: "9f93a97",
    requiredQuotes: [
      "40/41 exact fruit-name overlap in the game's own description, matching genre, and a game icon byte-identical",
      "cached real artwork for the 5 gamepasses with exact Roblox Game Pass name matches (Dark Blade, Fruit Notifier, 2x Mastery, 2x Money, Fast Boats)",
    ],
    forbiddenQuotes: [],
    evidence: ({ commit, commentCommit }) => ({
      original_method: "manual_content_icon_match",
      original_method_basis: `commit ${commit}: identity established before the mapping was added from exact fruit-name matches in the game's own description (40/41), a matching genre, and a game icon byte-identical to store_games.icon_url. Not established by game pass overlap.`,
      original_evidence: {
        source: `commit ${commit}`,
        description_fruit_name_overlap: "40/41",
        genre_match: true,
        game_icon_byte_identical_to_store_icon: true,
      },
      later_gamepass_overlap_count: 5,
      later_gamepass_overlap_names: ["Dark Blade", "Fruit Notifier", "2x Mastery", "2x Money", "Fast Boats"],
      later_gamepass_overlap_note: "Exact Game Pass name matches found when scripts/sync-roblox-gamepasses.mjs ran after the mapping was added. Supporting evidence only, not the original basis.",
      legacy_comment_note: `The roblox-universe-ids.ts statement that entries were confirmed by game pass overlap was first written in commit ${commentCommit}, before this mapping was added, and does not describe how this mapping was established.`,
    }),
  }],
  // Anime Origins: stays trusted on the legacy reviewed source, but its
  // introducing commit records no per-game overlap evidence.
  ["6aa7180c-4199-454c-9a6a-b87c22766aab", {
    introducedIn: "603b50d",
    requiredQuotes: ["registers Anime Origins' verified Roblox universe id"],
    forbiddenQuotes: ["overlap"],
    evidence: ({ commit, commentCommit, tsLastChangedCommit }) => ({
      original_method_attested_by: "legacy_source_comment",
      per_game_overlap_evidence_recorded: false,
      trust_basis: `No per-game overlap evidence was recorded. Commit ${commit}, which added this mapping, only states that it registers Anime Origins' verified Roblox universe id. Trust comes from the legacy reviewed source: the mapping is in roblox-universe-ids.json, and roblox-universe-ids.ts states that every entry except Karinderya was confirmed by exact game pass name overlap.`,
      legacy_comment_timing: `That roblox-universe-ids.ts statement was first written in commit ${commentCommit}, before this mapping was added, and was last amended in commit ${tsLastChangedCommit} while this mapping was present.`,
    }),
  }],
]);

// Robux currency products sold as catalog "games". Not Roblox experiences.
const NOT_ROBLOX = [
  { gameId: "bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75", name: "Robux Sell — Covered Tax", storeReference: "src/config/robux-via-link.ts" },
  { gameId: "e5318653-6b19-417c-9f89-1a7baa2331aa", name: "Robux Sell — No Tax", storeReference: "src/config/robux-via-link.ts" },
  { gameId: "cc1ec858-663c-4ff2-9185-e3d587780b46", name: "ROBUX PLUS", storeReference: "src/config/robux-products.ts" },
];

// Deliberately left with no identity row in this phase.
const LEGACY_UNCLASSIFIED = { gameId: "f67125ef-5a16-4e7d-83c0-ec375cfb1f53", name: "Robux Sell" };

const EXPECTED_NEEDS_REVIEW_NAMES = [
  "Build a ring farm",
  "Evomon",
  "Gakuran",
  "Redliner",
  "Strongest Battlegrounds",
  "Survive the Apocalypse",
];

class GenerationError extends Error {
  constructor(problems) {
    super(problems.join("\n"));
    this.problems = problems;
  }
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Mirrors PostgreSQL btrim(), which set_game_roblox_identity() applies to names.
const btrim = (text) => text.replace(/^ +| +$/g, "");
// Commit messages are hard-wrapped, so quotes are matched whitespace-insensitively.
const normalizeWhitespace = (text) => text.replace(/\s+/g, " ").trim();

function isAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

// ---------------------------------------------------------------------------
// Store sources
// ---------------------------------------------------------------------------

function readSourceProvenance() {
  if (!existsSync(TRUSTED_MAPPINGS_PATH) || !existsSync(TS_PATH)) {
    throw new GenerationError(["Run from the BudgetWise_Store repository root"]);
  }

  const dirty = git("status", "--porcelain", "--", TRUSTED_MAPPINGS_PATH, TS_PATH);
  if (dirty) {
    throw new GenerationError([`Trusted source files have uncommitted changes, so no commit describes them:\n${dirty}`]);
  }

  const legacyOverlapCommentCommit = git(
    "log", "--reverse", "--format=%H", "-S", LEGACY_OVERLAP_COMMENT, "--", TS_PATH,
  ).split("\n")[0];
  if (!legacyOverlapCommentCommit || !readFileSync(TS_PATH, "utf8").includes(LEGACY_OVERLAP_COMMENT)) {
    throw new GenerationError([`${TS_PATH} no longer contains the legacy overlap statement: ${LEGACY_OVERLAP_COMMENT}`]);
  }

  return {
    sourceCommit: git("rev-parse", "HEAD"),
    lastChangedCommit: git("log", "-1", "--format=%H", "--", TRUSTED_MAPPINGS_PATH, TS_PATH),
    tsLastChangedCommit: git("log", "-1", "--format=%H", "--", TS_PATH),
    legacyOverlapCommentCommit,
    jsonBlob: git("rev-parse", `HEAD:${TRUSTED_MAPPINGS_PATH}`),
    tsBlob: git("rev-parse", `HEAD:${TS_PATH}`),
  };
}

// For each current mapping, the commit where its current universe id first
// appeared and has stayed unchanged since.
function mappingIntroductions(trusted) {
  const commits = git("log", "--reverse", "--format=%H %aI", "--", TRUSTED_MAPPINGS_PATH)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, date] = line.split(" ");
      return { hash, date };
    });

  const since = new Map();
  for (const commit of commits) {
    const snapshot = parseTrustedMappings(git("show", `${commit.hash}:${TRUSTED_MAPPINGS_PATH}`));
    for (const [gameId, universeId] of trusted) {
      if (snapshot.get(gameId) !== universeId) since.delete(gameId);
      else if (!since.has(gameId)) since.set(gameId, commit);
    }
  }

  const unresolved = [...trusted.keys()].filter((gameId) => !since.has(gameId));
  if (unresolved.length > 0) {
    throw new GenerationError([`No commit introduces the current mapping for: ${unresolved.join(", ")}`]);
  }
  return since;
}

// Parses the "Deliberately NOT configured" comment block of the TS file.
function parseNeedsReview(tsText) {
  const lines = tsText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("// Deliberately NOT configured"));
  if (start === -1) throw new GenerationError([`${TS_PATH} has no "Deliberately NOT configured" block`]);

  const entries = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "//") break;

    const head = line.match(
      /^\/\/ {3}- (.+?) \(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\) — (.+)$/,
    );
    if (head) {
      entries.push({ name: head[1], gameId: head[2], reason: head[3].trim() });
      continue;
    }

    const continuation = line.match(/^\/\/ {5}(\S.*)$/);
    if (continuation && entries.length > 0) {
      entries.at(-1).reason += ` ${continuation[1].trim()}`;
      continue;
    }

    throw new GenerationError([`Unrecognized line in the ${TS_PATH} "Deliberately NOT configured" block: ${line}`]);
  }
  return entries;
}

function resolveRecordedEvidence(gameId, tsText) {
  const problems = [];
  const evidence = (RECORDED_EVIDENCE.get(gameId) ?? []).map((entry) => {
    let source;
    let sourceText;
    if (entry.file) {
      source = entry.file;
      sourceText = tsText;
    } else {
      const hash = git("rev-parse", "--verify", `${entry.commit}^{commit}`);
      source = `commit ${hash}`;
      sourceText = git("show", "-s", "--format=%B", hash);
    }
    if (!normalizeWhitespace(sourceText).includes(normalizeWhitespace(entry.quote))) {
      problems.push(`Recorded evidence for ${gameId} no longer appears in ${source}: ${entry.quote}`);
    }
    return { source, note: entry.note };
  });
  return { evidence, problems };
}

function resolveProvenanceCorrection(gameId, introduced, provenance) {
  const correction = PROVENANCE_CORRECTIONS.get(gameId);
  if (!correction) return { evidence: null, problems: [] };

  const problems = [];
  const commit = git("rev-parse", "--verify", `${correction.introducedIn}^{commit}`);
  if (introduced.hash !== commit) {
    problems.push(`${gameId}: mapping was introduced in ${introduced.hash}, but its provenance correction describes ${commit}`);
  }

  const message = normalizeWhitespace(git("show", "-s", "--format=%B", commit));
  for (const quote of correction.requiredQuotes) {
    if (!message.includes(normalizeWhitespace(quote))) {
      problems.push(`${gameId}: commit ${commit} no longer contains: ${quote}`);
    }
  }
  for (const quote of correction.forbiddenQuotes) {
    if (message.toLowerCase().includes(quote.toLowerCase())) {
      problems.push(`${gameId}: commit ${commit} mentions "${quote}"; re-review this provenance correction`);
    }
  }

  const { legacyOverlapCommentCommit: commentCommit, tsLastChangedCommit } = provenance;
  if (commentCommit === commit || !isAncestor(commentCommit, commit)) {
    problems.push(`${gameId}: the legacy overlap statement (${commentCommit}) does not predate ${commit}`);
  }
  if (!isAncestor(commit, tsLastChangedCommit)) {
    problems.push(`${gameId}: ${TS_PATH} was last changed (${tsLastChangedCommit}) before ${commit}`);
  }

  return { evidence: correction.evidence({ commit, commentCommit, tsLastChangedCommit }), problems };
}

// ---------------------------------------------------------------------------
// Roblox (generation-time reads only)
// ---------------------------------------------------------------------------

async function fetchJsonWithRetry(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(1500 * attempt);
      continue;
    }
    if (res.status !== 200) throw new Error(`HTTP ${res.status} from ${url}`);
    try {
      return await res.json();
    } catch {
      throw new Error(`Non-JSON response from ${url}`);
    }
  }
}

async function fetchRobloxGames(universeIds) {
  const games = new Map();
  const problems = [];

  for (let i = 0; i < universeIds.length; i += ROBLOX_BATCH_SIZE) {
    const batch = universeIds.slice(i, i + ROBLOX_BATCH_SIZE);
    const body = await fetchJsonWithRetry(`${ROBLOX_GAMES_ENDPOINT}?universeIds=${batch.join(",")}`);

    if (!body || !Array.isArray(body.data)) {
      problems.push(`Roblox response for universes ${batch.join(",")} has no data array`);
      continue;
    }

    for (const item of body.data) {
      const returnedId = Number.isSafeInteger(item?.id) ? String(item.id) : null;
      if (!returnedId || !batch.includes(returnedId)) {
        problems.push(`Roblox returned a universe that was not requested: ${JSON.stringify(item?.id)}`);
      } else if (games.has(returnedId)) {
        problems.push(`Roblox returned universe ${returnedId} more than once`);
      } else {
        games.set(returnedId, item);
      }
    }

    await sleep(400);
  }

  return { games, problems };
}

function validateRobloxGame(universeId, item) {
  if (!item) return { problems: ["not returned by Roblox (unknown, deleted, or unavailable universe)"] };

  const problems = [];
  if (!Number.isSafeInteger(item.id) || item.id <= 0 || String(item.id) !== universeId) {
    problems.push(`returned id ${JSON.stringify(item.id)} does not equal requested universe ${universeId}`);
  }
  if (!Number.isSafeInteger(item.rootPlaceId) || item.rootPlaceId <= 0) {
    problems.push(`invalid rootPlaceId ${JSON.stringify(item.rootPlaceId)}`);
  }

  const name = typeof item.name === "string" ? btrim(item.name) : "";
  if (!name) problems.push("missing name");
  else if (name.toUpperCase() === "[TITLE UNAVAILABLE]") problems.push("name is [TITLE UNAVAILABLE]");
  else if ([...name].length > 200) problems.push("name exceeds 200 characters");
  else if (/[ \\]/.test(name)) problems.push("name contains a NUL or backslash character");

  let creator = null;
  if (item.creator !== undefined && item.creator !== null) {
    const c = item.creator;
    const valid =
      typeof c === "object" &&
      (c.type === "User" || c.type === "Group") &&
      Number.isSafeInteger(c.id) &&
      c.id > 0 &&
      (c.name === undefined || typeof c.name === "string") &&
      (c.hasVerifiedBadge === undefined || typeof c.hasVerifiedBadge === "boolean");
    if (!valid) {
      problems.push(`structurally invalid creator ${JSON.stringify(c)}`);
    } else {
      creator = {
        type: c.type,
        id: String(c.id),
        name: c.name ?? null,
        hasVerifiedBadge: c.hasVerifiedBadge ?? null,
      };
    }
  }

  return { problems, name, rootPlaceId: String(item.rootPlaceId), creator };
}

// ---------------------------------------------------------------------------
// Seed rows
// ---------------------------------------------------------------------------

async function buildSeed() {
  const problems = [];
  const provenance = readSourceProvenance();
  const tsText = readFileSync(TS_PATH, "utf8");
  const trusted = parseTrustedMappings(readFileSync(TRUSTED_MAPPINGS_PATH, "utf8"));
  const introductions = mappingIntroductions(trusted);
  const needsReview = parseNeedsReview(tsText);

  // Owner-confirmed exceptions must still be what the TS file documents.
  for (const [gameId, expected] of OWNER_CONFIRMED) {
    if (!tsText.includes(`(${gameId})`) ||
        !tsText.includes(`universe (${expected.universeId}) and place (${expected.rootPlaceId})`)) {
      problems.push(`${TS_PATH} no longer documents the owner-confirmed identity for ${gameId}`);
    }
    if (trusted.get(gameId) !== expected.universeId) {
      problems.push(`Owner-confirmed game ${gameId} maps to ${trusted.get(gameId)}, expected ${expected.universeId}`);
    }
  }

  const parsedNames = needsReview.map((entry) => entry.name).sort();
  if (JSON.stringify(parsedNames) !== JSON.stringify([...EXPECTED_NEEDS_REVIEW_NAMES].sort())) {
    problems.push(`needs_review entries in ${TS_PATH} are ${JSON.stringify(parsedNames)}, expected ${JSON.stringify(EXPECTED_NEEDS_REVIEW_NAMES)}`);
  }

  for (const entry of NOT_ROBLOX) {
    if (!readFileSync(entry.storeReference, "utf8").includes(entry.gameId)) {
      problems.push(`${entry.storeReference} no longer references not_roblox game ${entry.gameId}`);
    }
  }

  // Every seeded game id belongs to exactly one category.
  const categoryIds = [
    ...trusted.keys(),
    ...NOT_ROBLOX.map((entry) => entry.gameId),
    ...needsReview.map((entry) => entry.gameId),
  ];
  const repeated = categoryIds.filter((id, index) => categoryIds.indexOf(id) !== index);
  if (repeated.length > 0) problems.push(`Game ids appear in more than one category: ${[...new Set(repeated)].join(", ")}`);
  if (categoryIds.includes(LEGACY_UNCLASSIFIED.gameId)) {
    problems.push(`Legacy "${LEGACY_UNCLASSIFIED.name}" (${LEGACY_UNCLASSIFIED.gameId}) must stay unclassified`);
  }

  // Live public.games (read-only) pins each id to its current name.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new GenerationError(["NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"]);
  }
  const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: liveGames, error, count } = await supabase
    .from("games")
    .select("id, name", { count: "exact" })
    .order("id");
  if (error) throw new GenerationError([`public.games read failed: ${error.message}`]);
  if (liveGames.length !== count) throw new GenerationError([`Read ${liveGames.length} of ${count} games`]);
  const liveNames = new Map(liveGames.map((game) => [game.id, game.name]));

  for (const id of categoryIds) {
    if (!liveNames.has(id)) problems.push(`Game ${id} does not exist in live public.games`);
  }
  for (const entry of [...NOT_ROBLOX, ...needsReview, LEGACY_UNCLASSIFIED]) {
    if (liveNames.has(entry.gameId) && liveNames.get(entry.gameId) !== entry.name) {
      problems.push(`Game ${entry.gameId} is named ${JSON.stringify(liveNames.get(entry.gameId))} live, expected ${JSON.stringify(entry.name)}`);
    }
  }
  if (!liveNames.has(LEGACY_UNCLASSIFIED.gameId)) {
    problems.push(`Legacy "${LEGACY_UNCLASSIFIED.name}" (${LEGACY_UNCLASSIFIED.gameId}) is missing from live public.games`);
  }

  // Roblox snapshot for every trusted universe.
  const fetchedAt = new Date().toISOString();
  const { games: robloxGames, problems: fetchProblems } = await fetchRobloxGames([...trusted.values()]);
  problems.push(...fetchProblems);

  const verified = [];
  for (const [gameId, universeId] of trusted) {
    const checked = validateRobloxGame(universeId, robloxGames.get(universeId));
    const label = `${liveNames.get(gameId) ?? gameId} (universe ${universeId})`;
    problems.push(...checked.problems.map((problem) => `${label}: ${problem}`));
    if (checked.problems.length > 0) continue;

    const ownerConfirmed = OWNER_CONFIRMED.get(gameId);
    if (ownerConfirmed && checked.rootPlaceId !== ownerConfirmed.rootPlaceId) {
      problems.push(`${label}: Roblox root place ${checked.rootPlaceId} differs from owner-confirmed place ${ownerConfirmed.rootPlaceId}`);
      continue;
    }

    const introduced = introductions.get(gameId);
    const correction = resolveProvenanceCorrection(gameId, introduced, provenance);
    const originalMethod = ownerConfirmed
      ? "owner_confirmed"
      : correction.evidence?.original_method ?? "gamepass_overlap";
    const recorded = resolveRecordedEvidence(gameId, tsText);
    problems.push(...correction.problems, ...recorded.problems);

    const evidence = {
      source: "roblox-universe-ids.json",
      source_path: TRUSTED_MAPPINGS_PATH,
      source_repository: SOURCE_REPOSITORY,
      source_commit: provenance.sourceCommit,
      source_last_changed_commit: provenance.lastChangedCommit,
      source_json_blob: provenance.jsonBlob,
      source_ts_blob: provenance.tsBlob,
      mapping_introduced_commit: introduced.hash,
      mapping_introduced_at: introduced.date,
      original_method: originalMethod,
      original_method_basis: METHOD_BASIS[originalMethod],
      ...(ownerConfirmed ? { owner_confirmed_root_place_id: Number(ownerConfirmed.rootPlaceId) } : {}),
      ...(correction.evidence ?? {}),
      ...(recorded.evidence.length > 0 ? { recorded_evidence: recorded.evidence } : {}),
      roblox_api_snapshot: {
        endpoint: ROBLOX_GAMES_ENDPOINT,
        fetched_at: fetchedAt,
        creator_name: checked.creator?.name ?? null,
        creator_has_verified_badge: checked.creator?.hasVerifiedBadge ?? null,
      },
    };

    verified.push({
      gameId,
      expectedName: liveNames.get(gameId),
      status: "verified",
      universeId,
      rootPlaceId: checked.rootPlaceId,
      robloxName: checked.name,
      creatorType: checked.creator?.type ?? null,
      creatorId: checked.creator?.id ?? null,
      method: "legacy_json_import",
      verifiedAt: introduced.date,
      reviewNote: null,
      evidence,
      originalMethod,
    });
  }

  const notRoblox = NOT_ROBLOX.map((entry) => ({
    gameId: entry.gameId,
    expectedName: entry.name,
    status: "not_roblox",
    reviewNote: "Robux currency product sold through the Store, not a Roblox experience.",
    evidence: {
      source: "roblox_identity_rollout_plan",
      decision: "not_roblox",
      basis: "Robux currency pseudo-game approved as not_roblox in the Phase 2 identity import plan",
      store_reference: entry.storeReference,
      source_repository: SOURCE_REPOSITORY,
      source_commit: provenance.sourceCommit,
    },
  }));

  const reviewRows = needsReview.map((entry) => ({
    gameId: entry.gameId,
    expectedName: entry.name,
    status: "needs_review",
    reviewNote: `Deliberately not configured in roblox-universe-ids.ts (needs manual follow-up, do not guess): ${entry.reason}`,
    evidence: {
      source: "roblox-universe-ids.ts",
      source_path: TS_PATH,
      source_repository: SOURCE_REPOSITORY,
      source_commit: provenance.sourceCommit,
      source_ts_blob: provenance.tsBlob,
      documented_in_commit: git("log", "--reverse", "--format=%H", "-S", entry.gameId, "--", TS_PATH).split("\n")[0],
      decision: "deliberately_not_configured",
      documented_reason: entry.reason,
      candidate_universe_ids_recorded: false,
    },
  }));

  for (const row of [...notRoblox, ...reviewRows]) {
    if ([...row.reviewNote].length > 2000) problems.push(`${row.expectedName}: review_note exceeds 2000 characters`);
  }

  const counts = { verified: verified.length, not_roblox: notRoblox.length, needs_review: reviewRows.length };
  if (JSON.stringify(counts) !== JSON.stringify(EXPECTED_COUNTS)) {
    problems.push(`Seed counts ${JSON.stringify(counts)} differ from expected ${JSON.stringify(EXPECTED_COUNTS)}`);
  }

  const originalMethods = Object.fromEntries(
    Object.entries(
      verified.reduce((acc, row) => ({ ...acc, [row.originalMethod]: (acc[row.originalMethod] ?? 0) + 1 }), {}),
    ).sort(([a], [b]) => a.localeCompare(b)),
  );
  if (JSON.stringify(originalMethods) !== JSON.stringify(EXPECTED_ORIGINAL_METHODS)) {
    problems.push(`Original method counts ${JSON.stringify(originalMethods)} differ from expected ${JSON.stringify(EXPECTED_ORIGINAL_METHODS)}`);
  }

  if (problems.length > 0) throw new GenerationError(problems);

  const byName = (a, b) => a.expectedName.localeCompare(b.expectedName, "en", { sensitivity: "base" });
  const seededIds = new Set(categoryIds);
  const unclassified = liveGames
    .filter((game) => !seededIds.has(game.id))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return {
    provenance,
    supabaseHost,
    fetchedAt,
    rows: [...verified.sort(byName), ...notRoblox.sort(byName), ...reviewRows.sort(byName)],
    unclassified,
  };
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

function sqlText(value) {
  if (value === null || value === undefined) return "NULL";
  if (/[ \\]/.test(value)) throw new GenerationError([`Refusing to emit a text literal containing NUL or backslash: ${value}`]);
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlInteger(value) {
  if (value === null || value === undefined) return "NULL";
  if (!/^[1-9][0-9]*$/.test(value)) throw new GenerationError([`Refusing to emit a non-positive integer literal: ${value}`]);
  return value;
}

function sqlJson(value) {
  const json = JSON.stringify(value);
  if (json.includes("$evidence$")) throw new GenerationError(["Evidence contains the $evidence$ quote tag"]);
  return `$evidence$${json}$evidence$`;
}

function sqlRow(row) {
  return [
    `  -- ${row.expectedName}`,
    `  (${sqlText(row.gameId)}, ${sqlText(row.expectedName)}, ${sqlText(row.status)},`,
    `   ${sqlInteger(row.universeId)}, ${sqlInteger(row.rootPlaceId)}, ${sqlText(row.robloxName)}, ${sqlText(row.creatorType)}, ${sqlInteger(row.creatorId)},`,
    `   ${sqlText(row.method)}, ${sqlText(row.verifiedAt)}, ${sqlText(row.reviewNote)},`,
    `   ${sqlJson(row.evidence)})`,
  ].join("\n");
}

function renderMigration({ provenance, supabaseHost, fetchedAt, rows, unclassified }) {
  const total = rows.length;
  const listFor = (status) =>
    rows.filter((row) => row.status === status).map((row) => `--   ${row.gameId}  ${row.expectedName}`).join("\n");
  const verifiedRows = rows.filter((row) => row.status === "verified");
  const methodLines = [...new Set(verifiedRows.map((row) => row.originalMethod))]
    .sort()
    .map((method) => {
      const matching = verifiedRows.filter((row) => row.originalMethod === method);
      const legacyOnly = matching.filter((row) => row.evidence.original_method_attested_by === "legacy_source_comment");
      const note =
        method === "gamepass_overlap"
          ? legacyOnly.length > 0
            ? ` (${legacyOnly.map((row) => row.expectedName).join(", ")}: attested only by the legacy source comment)`
            : ""
          : ` (${matching.map((row) => row.expectedName).join(", ")})`;
      return `--                      ${method} ${matching.length}${note}`;
    })
    .join("\n");

  return `-- Migration 064: Seed first-class Roblox game identity (data only).
--
-- GENERATED by BudgetWise_Store scripts/generate-roblox-identity-seed.mjs.
-- Do not hand-edit; regenerate from the Store sources instead.
--
-- Imports the already-reviewed Roblox identity decisions into
-- public.game_roblox_identity (migration 063) so the database can be proven
-- identical to the trusted Store config before anything reads identity from
-- the database. Nothing consumes these rows yet.
--
-- Sources (BudgetWise_Store):
--   commit                  ${provenance.sourceCommit}
--   last source change      ${provenance.lastChangedCommit}
--   ${TRUSTED_MAPPINGS_PATH}  blob ${provenance.jsonBlob}
--   ${TS_PATH}    blob ${provenance.tsBlob}
-- Game names pinned from live public.games on ${supabaseHost}.
-- Roblox snapshot (root place, name, creator) read from
-- ${ROBLOX_GAMES_ENDPOINT} at ${fetchedAt} during generation.
-- This file makes no network calls.
--
-- Rows (${total}):
--   verified      ${verifiedRows.length}  verification_method = 'legacy_json_import'. The original basis is kept in
--                    verification_evidence.original_method:
${methodLines}
--                    verified_at = the commit that introduced the mapping. verified_by stays NULL.
--   not_roblox    ${rows.filter((row) => row.status === "not_roblox").length}
${listFor("not_roblox")}
--   needs_review  ${rows.filter((row) => row.status === "needs_review").length}  no universe, root place, snapshot, or method is assigned
${listFor("needs_review")}
--
-- Live games this migration does not classify (they keep NO identity row;
-- "${LEGACY_UNCLASSIFIED.name}" by decision, any others simply have no reviewed decision yet):
${unclassified.map((game) => `--   ${game.id}  ${game.name}`).join("\n")}
--
-- Safety:
--   - public.games is only read. No game row, UUID, or column changes.
--   - No DELETE, no reinsert, no fuzzy matching.
--   - Guards RAISE before any insert if migration 063 is missing, direct
--     writes would not be audited, an expected game is missing or renamed,
--     the seed repeats a game or universe, or a trusted universe is already
--     verified for a different game.
--   - Inserts use ON CONFLICT (game_id) DO NOTHING. Every seeded game is then
--     checked field by field; an existing row that differs from this seed
--     RAISEs (rolling back the whole migration) instead of being overwritten.
--   - Re-running is a no-op: no rows change and no audit entries are added.
--   - New rows are recorded by the migration 063 audit trigger with
--     write_path = 'direct_sql'.
--
-- Requires migration 063. Run in Supabase SQL Editor. Safe to run multiple times.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Preconditions
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.games') IS NULL THEN
    RAISE EXCEPTION 'Migration 064 requires public.games';
  END IF;

  IF to_regclass('public.game_roblox_identity') IS NULL
     OR to_regclass('public.game_roblox_identity_audit_log') IS NULL
     OR to_regprocedure('public.set_game_roblox_identity(uuid, text, bigint, bigint, text, text, bigint, text, jsonb, text, text)') IS NULL
     OR to_regprocedure('public.audit_game_roblox_identity_direct_write()') IS NULL THEN
    RAISE EXCEPTION 'Migration 064 requires migration 063 (game_roblox_identity, its audit log, and set_game_roblox_identity)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.game_roblox_identity'::regclass
      AND t.tgname = 'game_roblox_identity_audit_direct_write'
      AND t.tgenabled IN ('O', 'A')
  ) THEN
    RAISE EXCEPTION 'Migration 064 requires the enabled migration 063 audit trigger game_roblox_identity_audit_direct_write';
  END IF;

  IF current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'Migration 064 must run with session_replication_role = origin so its writes are audited';
  END IF;

  IF current_setting('xob.game_roblox_identity_rpc', true) = 'on' THEN
    RAISE EXCEPTION 'Migration 064 must not run with xob.game_roblox_identity_rpc = on (it suppresses direct_sql audit entries)';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Seed data (literals generated from the Store sources above)
-- -----------------------------------------------------------------------------

CREATE TEMP TABLE migration_064_seed (
  game_id               uuid        NOT NULL,
  expected_game_name    text        NOT NULL,
  status                text        NOT NULL,
  universe_id           bigint,
  root_place_id         bigint,
  verified_roblox_name  text,
  verified_creator_type text,
  verified_creator_id   bigint,
  verification_method   text,
  verified_at           timestamptz,
  review_note           text,
  verification_evidence jsonb       NOT NULL
) ON COMMIT DROP;

INSERT INTO migration_064_seed (
  game_id, expected_game_name, status,
  universe_id, root_place_id, verified_roblox_name, verified_creator_type, verified_creator_id,
  verification_method, verified_at, review_note,
  verification_evidence
) VALUES
${rows.map(sqlRow).join(",\n")};

-- -----------------------------------------------------------------------------
-- 3. Guards (before any identity write)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_list text;
BEGIN
  SELECT string_agg(format('%s=%s', status, n), ', ' ORDER BY status)
  INTO v_list
  FROM (SELECT status, count(*) AS n FROM migration_064_seed GROUP BY status) c;

  IF (SELECT count(*) FROM migration_064_seed) <> ${total}
     OR (SELECT count(*) FROM migration_064_seed WHERE status = 'verified') <> ${EXPECTED_COUNTS.verified}
     OR (SELECT count(*) FROM migration_064_seed WHERE status = 'not_roblox') <> ${EXPECTED_COUNTS.not_roblox}
     OR (SELECT count(*) FROM migration_064_seed WHERE status = 'needs_review') <> ${EXPECTED_COUNTS.needs_review} THEN
    RAISE EXCEPTION 'Migration 064 seed has unexpected counts: %', v_list;
  END IF;

  SELECT string_agg(game_id::text, ', ')
  INTO v_list
  FROM (SELECT game_id FROM migration_064_seed GROUP BY game_id HAVING count(*) > 1) d;

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 064 seed repeats game ids: %', v_list;
  END IF;

  SELECT string_agg(universe_id::text, ', ')
  INTO v_list
  FROM (
    SELECT universe_id FROM migration_064_seed
    WHERE status = 'verified'
    GROUP BY universe_id HAVING count(*) > 1
  ) d;

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 064 seed repeats trusted universe ids: %', v_list;
  END IF;

  IF EXISTS (SELECT 1 FROM migration_064_seed WHERE game_id = '${LEGACY_UNCLASSIFIED.gameId}') THEN
    RAISE EXCEPTION 'Migration 064 must leave the hidden legacy Robux Sell game (${LEGACY_UNCLASSIFIED.gameId}) unclassified';
  END IF;

  SELECT string_agg(format('%s (%s)', s.game_id, s.expected_game_name), ', ' ORDER BY s.expected_game_name)
  INTO v_list
  FROM migration_064_seed s
  WHERE NOT EXISTS (SELECT 1 FROM public.games g WHERE g.id = s.game_id);

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 064 expected games are missing from public.games: %', v_list;
  END IF;

  SELECT string_agg(format('%s expected %L, found %L', s.game_id, s.expected_game_name, g.name), '; ' ORDER BY s.expected_game_name)
  INTO v_list
  FROM migration_064_seed s
  JOIN public.games g ON g.id = s.game_id
  WHERE g.name IS DISTINCT FROM s.expected_game_name;

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 064 game_id/name pairings no longer match: %', v_list;
  END IF;

  SELECT string_agg(format('universe %s is verified for game %s, seed expects game %s', i.universe_id, i.game_id, s.game_id), '; ')
  INTO v_list
  FROM public.game_roblox_identity i
  JOIN migration_064_seed s
    ON s.status = 'verified'
   AND s.universe_id = i.universe_id
  WHERE i.status = 'verified'
    AND i.game_id <> s.game_id;

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 064 trusted universe ids are already verified for other games: %', v_list;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Insert missing rows only (existing rows are never overwritten)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.game_roblox_identity (
    game_id, status, universe_id, root_place_id, verified_roblox_name,
    verified_creator_type, verified_creator_id, verification_method,
    verification_evidence, verified_at, review_note
  )
  SELECT
    game_id, status, universe_id, root_place_id, verified_roblox_name,
    verified_creator_type, verified_creator_id, verification_method,
    verification_evidence, verified_at, review_note
  FROM migration_064_seed
  ORDER BY game_id
  ON CONFLICT (game_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Migration 064 inserted % of ${total} seed rows', v_inserted;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Every seeded game must now hold exactly the seed identity
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_list         text;
  v_verified     bigint;
  v_not_roblox   bigint;
  v_needs_review bigint;
BEGIN
  SELECT string_agg(
           format('%s (%s): %s', s.game_id, s.expected_game_name,
             CASE
               WHEN i.game_id IS NULL THEN 'identity row missing'
               ELSE array_to_string(ARRAY[
                 CASE WHEN i.status IS DISTINCT FROM s.status THEN 'status' END,
                 CASE WHEN i.universe_id IS DISTINCT FROM s.universe_id THEN 'universe_id' END,
                 CASE WHEN i.root_place_id IS DISTINCT FROM s.root_place_id THEN 'root_place_id' END,
                 CASE WHEN i.verified_roblox_name IS DISTINCT FROM s.verified_roblox_name THEN 'verified_roblox_name' END,
                 CASE WHEN i.verified_creator_type IS DISTINCT FROM s.verified_creator_type THEN 'verified_creator_type' END,
                 CASE WHEN i.verified_creator_id IS DISTINCT FROM s.verified_creator_id THEN 'verified_creator_id' END,
                 CASE WHEN i.verification_method IS DISTINCT FROM s.verification_method THEN 'verification_method' END,
                 CASE WHEN i.verification_evidence IS DISTINCT FROM s.verification_evidence THEN 'verification_evidence' END,
                 CASE WHEN i.verified_at IS DISTINCT FROM s.verified_at THEN 'verified_at' END,
                 CASE WHEN i.verified_by IS NOT NULL THEN 'verified_by' END,
                 CASE WHEN i.review_note IS DISTINCT FROM s.review_note THEN 'review_note' END
               ], ', ')
             END),
           '; ' ORDER BY s.expected_game_name)
  INTO v_list
  FROM migration_064_seed s
  LEFT JOIN public.game_roblox_identity i ON i.game_id = s.game_id
  WHERE i.game_id IS NULL
     OR i.verified_by IS NOT NULL
     OR (i.status, i.universe_id, i.root_place_id, i.verified_roblox_name,
         i.verified_creator_type, i.verified_creator_id, i.verification_method,
         i.verification_evidence, i.verified_at, i.review_note)
        IS DISTINCT FROM
        (s.status, s.universe_id, s.root_place_id, s.verified_roblox_name,
         s.verified_creator_type, s.verified_creator_id, s.verification_method,
         s.verification_evidence, s.verified_at, s.review_note);

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 064 found existing Roblox identities that conflict with the reviewed seed (nothing was changed): %', v_list;
  END IF;

  SELECT count(*) FILTER (WHERE i.status = 'verified'),
         count(*) FILTER (WHERE i.status = 'not_roblox'),
         count(*) FILTER (WHERE i.status = 'needs_review')
  INTO v_verified, v_not_roblox, v_needs_review
  FROM public.game_roblox_identity i
  JOIN migration_064_seed s ON s.game_id = i.game_id;

  IF v_verified <> ${EXPECTED_COUNTS.verified} OR v_not_roblox <> ${EXPECTED_COUNTS.not_roblox} OR v_needs_review <> ${EXPECTED_COUNTS.needs_review} THEN
    RAISE EXCEPTION 'Migration 064 final counts are verified %, not_roblox %, needs_review % (expected ${EXPECTED_COUNTS.verified}, ${EXPECTED_COUNTS.not_roblox}, ${EXPECTED_COUNTS.needs_review})',
      v_verified, v_not_roblox, v_needs_review;
  END IF;

  RAISE NOTICE 'Migration 064 identities: verified %, not_roblox %, needs_review %', v_verified, v_not_roblox, v_needs_review;
END $$;

COMMIT;
`;
}

// ---------------------------------------------------------------------------

function printReview({ provenance, supabaseHost, fetchedAt, rows, unclassified }) {
  console.log(`Source commit: ${provenance.sourceCommit}`);
  console.log(`Live games read from: ${supabaseHost}`);
  console.log(`Roblox snapshot fetched at: ${fetchedAt}\n`);

  for (const row of rows) {
    if (row.status === "verified") {
      console.log(
        `verified      ${row.gameId}  ${JSON.stringify(row.expectedName)}\n` +
          `              universe ${row.universeId}  root place ${row.rootPlaceId}  roblox name ${JSON.stringify(row.robloxName)}\n` +
          `              creator ${row.creatorType ?? "-"} ${row.creatorId ?? "-"} (${row.evidence.roblox_api_snapshot.creator_name ?? "-"})` +
          `  original_method ${row.originalMethod}  introduced ${row.evidence.mapping_introduced_commit.slice(0, 7)} ${row.verifiedAt}` +
          (row.evidence.recorded_evidence ? `\n              recorded evidence: ${row.evidence.recorded_evidence.map((e) => e.note).join(" | ")}` : ""),
      );
    } else {
      console.log(`${row.status.padEnd(13)} ${row.gameId}  ${JSON.stringify(row.expectedName)}\n              note: ${row.reviewNote}`);
    }
  }

  const counts = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
  console.log(`\nCounts: ${JSON.stringify(counts)}`);
  console.log(`Live games left with no identity row: ${unclassified.map((game) => `${game.name} (${game.id})`).join(", ")}`);
}

async function main() {
  const writePath = argValue("--write");
  const seed = await buildSeed();
  printReview(seed);

  const sql = renderMigration(seed);
  if (!writePath) {
    console.log(`\nDry run: all validation passed. ${MIGRATION_NAME} not written (pass --write <path>).`);
    return;
  }
  if (existsSync(writePath)) {
    throw new GenerationError([`${writePath} already exists; refusing to overwrite a reviewed migration`]);
  }
  writeFileSync(writePath, sql, "utf8");
  console.log(`\nWrote ${writePath}`);
}

main().catch((err) => {
  if (err instanceof GenerationError) {
    console.error(`\nGeneration STOPPED. No migration written. ${err.problems.length} problem(s):`);
    for (const problem of err.problems) console.error(`  - ${problem}`);
  } else {
    console.error(`\nGeneration STOPPED. No migration written. ${err instanceof Error ? err.stack : String(err)}`);
  }
  process.exitCode = 1;
});
