// Read-only comparison of the two Roblox identity sources exactly as the
// Store loads them (scripts/lib/roblox-identity-source.mjs, which shares
// src/lib/roblox-identity-core.mjs with the Next.js runtime).
//
// Reports each source's counts, whether the verified game -> universe maps
// are identical, the not_roblox / needs_review games, and games with no
// identity row split into visible and hidden. Run before and after flipping
// ROBLOX_IDENTITY_SOURCE to db.
//
// Exits 0 when the verified maps are identical, 1 when they differ, 2 if the
// check could not run. Visible games without an identity row are printed as
// warnings but do not change the exit code. Only ever SELECTs; logs the
// target hostname, never the key.
//
// Run with: node --env-file=.env.local scripts/check-roblox-identity-sources.mjs
import { createClient } from "@supabase/supabase-js";
import { resolveRobloxIdentitySource } from "../src/lib/roblox-identity-core.mjs";
import {
  describeRobloxIdentity,
  loadRobloxIdentityForScript,
} from "./lib/roblox-identity-source.mjs";

function targetHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "(unparseable NEXT_PUBLIC_SUPABASE_URL)";
  }
}

function printGames(label, games) {
  console.log(`${label}: ${games.length}`);
  for (const game of games) {
    console.log(`  ${game.id}  ${game.availability_status}  ${JSON.stringify(game.name)}`);
  }
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  let configured;
  try {
    configured = resolveRobloxIdentitySource(process.env.ROBLOX_IDENTITY_SOURCE);
  } catch (error) {
    configured = `INVALID (${error.message})`;
  }
  console.log(`Target Supabase project: ${targetHostname()}`);
  console.log(`ROBLOX_IDENTITY_SOURCE in this environment: ${configured}\n`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const json = await loadRobloxIdentityForScript({ env: { ROBLOX_IDENTITY_SOURCE: "json" } });
  const db = await loadRobloxIdentityForScript({ supabase, env: { ROBLOX_IDENTITY_SOURCE: "db" } });
  console.log(describeRobloxIdentity(json));
  console.log(describeRobloxIdentity(db));

  const jsonMap = json.verifiedUniverseIds();
  const dbMap = db.verifiedUniverseIds();
  const differences = [...new Set([...Object.keys(jsonMap), ...Object.keys(dbMap)])]
    .sort()
    .filter((gameId) => jsonMap[gameId] !== dbMap[gameId])
    .map((gameId) => ({ game_id: gameId, json: jsonMap[gameId] ?? null, db: dbMap[gameId] ?? null }));

  console.log(`\nVerified maps identical: ${differences.length === 0 ? "yes" : "NO"}`);
  for (const difference of differences) console.log(`  ${JSON.stringify(difference)}`);

  const { data: games, error } = await supabase
    .from("games")
    .select("id, name, availability_status")
    .order("name");
  if (error) throw new Error(`games read failed: ${error.message}`);

  const withStatus = (status) => games.filter((game) => db.getStatus(game.id) === status);
  const unreviewed = withStatus("unreviewed");
  const visibleUnreviewed = unreviewed.filter((game) => game.availability_status !== "hidden");

  console.log("");
  printGames("not_roblox", withStatus("not_roblox"));
  printGames("needs_review", withStatus("needs_review"));
  printGames("No identity row, hidden (no health issue)", unreviewed.filter((game) => game.availability_status === "hidden"));
  printGames("No identity row, visible (health warning: Roblox identity not reviewed)", visibleUnreviewed);
  if (visibleUnreviewed.length > 0) {
    console.log("\nWARNING: visible games have no Roblox identity row; review them in XOB.");
  }

  process.exitCode = differences.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`Identity source check could not run: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 2;
});
