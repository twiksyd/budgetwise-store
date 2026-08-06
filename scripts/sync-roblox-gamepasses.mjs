// Offline sync: fetches official Roblox Game Pass artwork for the pilot
// games in src/config/roblox-universe-ids.json and caches it in the
// Store-owned roblox_gamepass_icon_cache table. Never run automatically by
// the storefront — this is a manual/maintenance operation. Run it:
//   - once, after adding a new entry to roblox-universe-ids.json
//   - to pick up new products added to an already-configured game
//   - as a manual refresh (e.g. a game's gamepasses changed on Roblox)
//
// Run with: node --env-file=.env.local scripts/sync-roblox-gamepasses.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const universeIds = JSON.parse(
  readFileSync(join(repoRoot, "src/config/roblox-universe-ids.json"), "utf8"),
);

// Deterministic, auditable normalization — not fuzzy/probabilistic matching.
// Only the " Pass"/" Gamepass" suffix strip is a judgment call: verified
// against real data (Drag Drive Simulator) that Roblox's actual pass names
// routinely add this suffix where our own product names don't ("Suspension
// Pro" vs "Suspension Pro Pass"), and stripping a fixed, content-free
// trailing word is still an exact-match rule, not a guess — two genuinely
// different passes that happen to only differ by that suffix would still
// collide safely into one normalized bucket, which the ambiguous-match
// check below already treats as "don't guess, skip it."
function normalize(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*(pass|gamepass)$/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

async function fetchAllGamePasses(universeId) {
  const passes = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes`,
    );
    url.searchParams.set("passView", "Full");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Roblox game-passes fetch failed (${res.status}) for universe ${universeId}`,
      );
    }
    const json = await res.json();
    passes.push(...json.gamePasses);
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return passes;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function fetchThumbnails(gamePassIds) {
  const map = new Map();
  for (const batch of chunk(gamePassIds, 100)) {
    if (batch.length === 0) continue;
    const url = new URL("https://thumbnails.roblox.com/v1/game-passes");
    url.searchParams.set("gamePassIds", batch.join(","));
    url.searchParams.set("size", "150x150");
    url.searchParams.set("format", "Png");

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  thumbnail batch fetch failed (${res.status}) — leaving those unmatched`);
      continue;
    }
    const json = await res.json();
    for (const item of json.data) {
      if (item.state === "Completed" && item.imageUrl) {
        map.set(item.targetId, item.imageUrl);
      }
    }
  }
  return map;
}

async function syncGame(gameId, universeId) {
  console.log(`\n=== Syncing game ${gameId} (universe ${universeId}) ===`);

  const robloxPasses = await fetchAllGamePasses(universeId);
  console.log(`  fetched ${robloxPasses.length} real Roblox game passes`);

  // normalized name -> set of distinct Roblox game pass ids that produced it
  const byNormalizedName = new Map();
  for (const pass of robloxPasses) {
    for (const rawName of [pass.name, pass.displayName]) {
      const norm = normalize(rawName ?? "");
      if (!norm) continue;
      const ids = byNormalizedName.get(norm) ?? new Set();
      ids.add(pass.id);
      byNormalizedName.set(norm, ids);
    }
  }

  const { data: ourProducts, error: productsError } = await supabase
    .from("store_gamepasses")
    .select("id, name")
    .eq("game_id", gameId);
  if (productsError) throw productsError;

  const results = [];
  for (const product of ourProducts) {
    const norm = normalize(product.name);
    const candidateIds = [...(byNormalizedName.get(norm) ?? [])];

    if (candidateIds.length === 0) {
      results.push({
        gamepass_id: product.id,
        roblox_universe_id: universeId,
        status: "no_match",
        roblox_gamepass_id: null,
        icon_url: null,
        matched_name: null,
        candidate_count: 0,
      });
    } else if (candidateIds.length > 1) {
      console.warn(
        `  AMBIGUOUS: "${product.name}" matched ${candidateIds.length} distinct Roblox game passes — leaving placeholder, needs manual review`,
      );
      results.push({
        gamepass_id: product.id,
        roblox_universe_id: universeId,
        status: "ambiguous",
        roblox_gamepass_id: null,
        icon_url: null,
        matched_name: null,
        candidate_count: candidateIds.length,
      });
    } else {
      const matched = robloxPasses.find((p) => p.id === candidateIds[0]);
      results.push({
        gamepass_id: product.id,
        roblox_universe_id: universeId,
        status: "matched",
        roblox_gamepass_id: candidateIds[0],
        icon_url: null, // filled in below, after thumbnail resolution
        matched_name: matched?.name ?? null,
        candidate_count: 1,
      });
    }
  }

  const matchedRobloxIds = results
    .filter((r) => r.status === "matched")
    .map((r) => r.roblox_gamepass_id);
  const thumbnails = await fetchThumbnails(matchedRobloxIds);

  for (const result of results) {
    if (result.status !== "matched") continue;
    const iconUrl = thumbnails.get(result.roblox_gamepass_id);
    if (iconUrl) {
      result.icon_url = iconUrl;
    } else {
      // Matched a name, but couldn't resolve real artwork — don't cache a
      // "matched" row with no icon. Fall back to the safe placeholder.
      console.warn(`  thumbnail unavailable for matched pass ${result.roblox_gamepass_id} — falling back to no_match`);
      result.status = "no_match";
      result.roblox_gamepass_id = null;
      result.matched_name = null;
    }
  }

  if (results.length > 0) {
    const { error: upsertError } = await supabase
      .from("roblox_gamepass_icon_cache")
      .upsert(results, { onConflict: "gamepass_id" });
    if (upsertError) throw upsertError;
  }

  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `  done: ${counts.matched ?? 0} matched, ${counts.no_match ?? 0} no match, ${counts.ambiguous ?? 0} ambiguous`,
  );
}

async function main() {
  const entries = Object.entries(universeIds);
  if (entries.length === 0) {
    console.log("No games configured in roblox-universe-ids.json — nothing to sync.");
    return;
  }

  for (const [gameId, universeId] of entries) {
    try {
      await syncGame(gameId, universeId);
    } catch (err) {
      // One game's Roblox API hiccup shouldn't abort the whole sync run —
      // log it and continue with the rest.
      console.error(`  ⨯ FAILED to sync game ${gameId}:`, err.message);
    }

    // Be polite to Roblox's API.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

main();
