// Offline sync: fetches official Roblox Game Pass artwork for every
// configured game in src/config/roblox-universe-ids.json, caches it, and
// detects/reports what changed since the last run. Never run automatically
// by the storefront — this is a manual/maintenance operation. Run it:
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

// How long an ambiguous match stays silent in the report before it's
// surfaced again as a reminder. It's still re-checked every single sync
// run regardless (that part is free — matching is in-memory string
// comparison against a list already fetched for other reasons) — this only
// controls report noise, not whether Roblox gets re-queried.
const AMBIGUOUS_RETRY_DAYS = 7;

function normalize(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*(pass|gamepass)$/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
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

// Roblox-side snapshot diff: new/removed passes, independent of whether
// they match one of our products. `skipIds` excludes passes already
// covered by a product-level event this run, so a removed pass we were
// actually selling isn't reported twice (once as "our product reverted"
// and again as "a Roblox pass disappeared").
async function diffSnapshot(universeId, robloxPasses, skipIds) {
  const { data: existing, error } = await supabase
    .from("roblox_gamepass_snapshot")
    .select("*")
    .eq("roblox_universe_id", universeId);
  if (error) throw error;

  const existingById = new Map(existing.map((row) => [row.roblox_gamepass_id, row]));
  const currentById = new Map(robloxPasses.map((pass) => [pass.id, pass]));
  const now = new Date().toISOString();

  const events = [];
  const upserts = [];
  for (const pass of robloxPasses) {
    const prev = existingById.get(pass.id);
    upserts.push({
      roblox_universe_id: universeId,
      roblox_gamepass_id: pass.id,
      name: pass.name,
      icon_url: prev?.icon_url ?? null,
      roblox_updated_at: pass.updated ?? null,
      first_seen_at: prev?.first_seen_at ?? now,
      last_seen_at: now,
    });
    if (!prev && !skipIds.has(pass.id)) {
      events.push({ type: "new_roblox_pass", name: pass.name });
    }
  }

  const removedIds = [];
  for (const prev of existing) {
    if (!currentById.has(prev.roblox_gamepass_id)) {
      removedIds.push(prev.roblox_gamepass_id);
      if (!skipIds.has(prev.roblox_gamepass_id)) {
        events.push({ type: "removed_roblox_pass", name: prev.name });
      }
    }
  }

  if (upserts.length > 0) {
    const { error: upsertError } = await supabase
      .from("roblox_gamepass_snapshot")
      .upsert(upserts, { onConflict: "roblox_universe_id,roblox_gamepass_id" });
    if (upsertError) throw upsertError;
  }
  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("roblox_gamepass_snapshot")
      .delete()
      .eq("roblox_universe_id", universeId)
      .in("roblox_gamepass_id", removedIds);
    if (deleteError) throw deleteError;
  }

  return events;
}

async function syncGame(gameId, universeId) {
  const { data: game, error: gameError } = await supabase
    .from("store_games")
    .select("name")
    .eq("id", gameId)
    .maybeSingle();
  if (gameError) throw gameError;
  const gameName = game?.name ?? gameId;

  console.log(`\n=== ${gameName} (universe ${universeId}) ===`);

  const robloxPasses = await fetchAllGamePasses(universeId);
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
  const passById = new Map(robloxPasses.map((p) => [p.id, p]));

  const { data: ourProducts, error: productsError } = await supabase
    .from("store_gamepasses")
    .select("id, name")
    .eq("game_id", gameId);
  if (productsError) throw productsError;

  const { data: existingRows, error: existingError } = await supabase
    .from("roblox_gamepass_icon_cache")
    .select("*")
    .in(
      "gamepass_id",
      ourProducts.map((p) => p.id),
    );
  if (existingError) throw existingError;
  const existingByProductId = new Map(existingRows.map((row) => [row.gamepass_id, row]));

  const now = new Date().toISOString();
  const toUpsert = [];
  const toTouch = []; // gamepass_ids that are unchanged — just bump last_verified_at
  const events = { unchanged: 0, new_match: 0, artwork_updated: 0, renamed: 0, removed: 0, ambiguous: 0, no_match: 0 };
  const details = [];
  const matchedRobloxIds = new Set();

  // First pass: resolve candidates (no network calls yet beyond what's
  // already fetched), so we know exactly which roblox pass ids need a
  // thumbnail lookup.
  const pending = [];
  for (const product of ourProducts) {
    const existing = existingByProductId.get(product.id);
    if (existing?.source === "manual") continue; // never overwrite a manual override

    const norm = normalize(product.name);
    const candidateIds = [...(byNormalizedName.get(norm) ?? [])];
    pending.push({ product, existing, candidateIds });
    if (candidateIds.length === 1) matchedRobloxIds.add(candidateIds[0]);
  }

  const thumbnails = await fetchThumbnails([...matchedRobloxIds]);

  for (const { product, existing, candidateIds } of pending) {
    if (candidateIds.length === 0) {
      if (existing?.status === "matched") {
        events.removed++;
        details.push({ type: "removed", product: product.name, roblox_name: existing.matched_name });
      }
      events.no_match++;
      if (existing?.status !== "no_match") {
        toUpsert.push({
          gamepass_id: product.id,
          roblox_universe_id: universeId,
          status: "no_match",
          source: null,
          roblox_gamepass_id: null,
          icon_url: null,
          matched_name: null,
          candidate_count: 0,
          roblox_updated_at: null,
          first_flagged_at: null,
          synced_at: now,
          last_verified_at: now,
        });
      } else {
        toTouch.push(product.id);
      }
      continue;
    }

    if (candidateIds.length > 1) {
      const wasAmbiguous = existing?.status === "ambiguous";
      const firstFlaggedAt = wasAmbiguous ? existing.first_flagged_at : now;
      const shouldReport =
        !wasAmbiguous || daysBetween(now, firstFlaggedAt) >= AMBIGUOUS_RETRY_DAYS;

      events.ambiguous++;
      if (shouldReport) {
        details.push({ type: "ambiguous", product: product.name, candidate_count: candidateIds.length });
      }
      toUpsert.push({
        gamepass_id: product.id,
        roblox_universe_id: universeId,
        status: "ambiguous",
        source: null,
        roblox_gamepass_id: null,
        icon_url: null,
        matched_name: null,
        candidate_count: candidateIds.length,
        roblox_updated_at: null,
        first_flagged_at: shouldReport ? now : firstFlaggedAt,
        synced_at: wasAmbiguous ? (existing.synced_at ?? now) : now,
        last_verified_at: now,
      });
      continue;
    }

    const pass = passById.get(candidateIds[0]);
    const iconUrl = thumbnails.get(candidateIds[0]);
    if (!iconUrl) {
      // Matched a name but couldn't resolve real artwork — safe fallback.
      events.no_match++;
      if (existing?.status !== "no_match") {
        toUpsert.push({
          gamepass_id: product.id,
          roblox_universe_id: universeId,
          status: "no_match",
          source: null,
          roblox_gamepass_id: null,
          icon_url: null,
          matched_name: null,
          candidate_count: 0,
          roblox_updated_at: null,
          first_flagged_at: null,
          synced_at: now,
          last_verified_at: now,
        });
      } else {
        toTouch.push(product.id);
      }
      continue;
    }

    matchedRobloxIds.add(pass.id);
    const isSameMatch = existing?.status === "matched" && existing.roblox_gamepass_id === pass.id;

    if (!isSameMatch) {
      events.new_match++;
      details.push({ type: "new_match", product: product.name, roblox_name: pass.name });
    } else if (existing.icon_url !== iconUrl) {
      events.artwork_updated++;
      details.push({ type: "artwork_updated", product: product.name });
    } else if (existing.matched_name !== pass.name) {
      events.renamed++;
      details.push({ type: "renamed", product: product.name, before: existing.matched_name, after: pass.name });
    } else {
      events.unchanged++;
      toTouch.push(product.id);
      continue; // truly identical — nothing to upsert
    }

    toUpsert.push({
      gamepass_id: product.id,
      roblox_universe_id: universeId,
      status: "matched",
      source: "roblox",
      roblox_gamepass_id: pass.id,
      icon_url: iconUrl,
      matched_name: pass.name,
      candidate_count: 1,
      roblox_updated_at: pass.updated ?? null,
      first_flagged_at: null,
      synced_at: now,
      last_verified_at: now,
    });
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("roblox_gamepass_icon_cache")
      .upsert(toUpsert, { onConflict: "gamepass_id" });
    if (upsertError) throw upsertError;
  }
  if (toTouch.length > 0) {
    const { error: touchError } = await supabase
      .from("roblox_gamepass_icon_cache")
      .update({ last_verified_at: now })
      .in("gamepass_id", toTouch);
    if (touchError) throw touchError;
  }

  const snapshotEvents = await diffSnapshot(universeId, robloxPasses, matchedRobloxIds);
  for (const event of snapshotEvents) details.push(event);

  // Console report — matches the requested format.
  const lines = [];
  if (events.unchanged > 0) lines.push(`  ✓ ${events.unchanged} unchanged`);
  const newCount =
    events.new_match + snapshotEvents.filter((e) => e.type === "new_roblox_pass").length;
  if (newCount > 0) lines.push(`  🆕 ${newCount} new`);
  if (events.artwork_updated > 0) lines.push(`  🖼️ ${events.artwork_updated} artwork updated`);
  if (events.renamed > 0) lines.push(`  📝 ${events.renamed} renamed`);
  const removedCount =
    events.removed + snapshotEvents.filter((e) => e.type === "removed_roblox_pass").length;
  if (removedCount > 0) lines.push(`  ❌ ${removedCount} removed`);
  if (events.ambiguous > 0) lines.push(`  ⚠️ ${events.ambiguous} ambiguous (needs manual review)`);
  if (lines.length === 0) lines.push("  ✓ no changes");
  console.log(lines.join("\n"));

  for (const d of details) {
    if (d.type === "new_match") console.log(`    🆕 "${d.product}" matched Roblox pass "${d.roblox_name}"`);
    if (d.type === "artwork_updated") console.log(`    🖼️ "${d.product}" artwork updated`);
    if (d.type === "renamed") console.log(`    📝 "${d.product}" — Roblox renamed "${d.before}" → "${d.after}"`);
    if (d.type === "removed") console.log(`    ❌ "${d.product}" — its Roblox pass ("${d.roblox_name}") no longer exists, reverted to placeholder`);
    if (d.type === "ambiguous") console.log(`    ⚠️ "${d.product}" matches ${d.candidate_count} Roblox passes — skipped, needs manual review`);
    if (d.type === "new_roblox_pass") console.log(`    🆕 Roblox has a pass not in your catalog yet: "${d.name}"`);
    if (d.type === "removed_roblox_pass") console.log(`    ❌ Roblox pass no longer exists: "${d.name}"`);
  }

  const { error: logError } = await supabase.from("roblox_sync_log").insert({
    game_id: gameId,
    roblox_universe_id: universeId,
    unchanged_count: events.unchanged,
    new_count: newCount,
    artwork_updated_count: events.artwork_updated,
    renamed_count: events.renamed,
    removed_count: removedCount,
    ambiguous_count: events.ambiguous,
    no_match_count: events.no_match,
    details,
  });
  if (logError) throw logError;
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
      console.error(`  ⨯ FAILED to sync game ${gameId}:`, err.message);
    }

    // Be polite to Roblox's API.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

main();
