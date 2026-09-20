// DB-native preflight for the daily deterministic icon backfill.
//
// Replaces the former JSON<->DB exact-parity gate. That gate required
// src/config/roblox-universe-ids.json and public.game_roblox_identity to
// agree exactly before the resolver could run, which meant every game
// verified through XOB also needed a manual JSON edit. Now that
// public.game_roblox_identity is the authoritative production source
// (ROBLOX_IDENTITY_SOURCE=db), a verified DB row is enough on its own.
//
// This script validates the DB source in isolation -- it never reads or
// compares against roblox-universe-ids.json. It checks:
//   - ROBLOX_IDENTITY_SOURCE actually resolves to "db" in this environment
//     (if it resolves to "json", the JSON rollback is active on purpose;
//     this preflight is a no-op and the resolver runs against JSON instead)
//   - public.game_roblox_identity loads successfully (no partial reads)
//   - every row has a valid game_id and a recognized status
//   - every verified row has a valid positive-integer universe_id
//   - no universe_id is claimed by more than one verified game
//   - not_roblox / needs_review rows carry no universe_id
// All of this is the same validation buildRobloxIdentityFromDbRows performs
// (src/lib/roblox-identity-core.mjs), run here explicitly and up front so a
// bad DB state fails the job before the resolver step, with a clear reason,
// instead of failing inside the resolver.
//
// Only ever SELECTs. Exits 0 when the resolver is safe to run (db validated,
// or json rollback active), 1 when the DB identity state is invalid, 2 if
// the check could not run (missing env, query failure). Logs only the target
// Supabase hostname and counts, never the service-role key.
//
// Run with: node --env-file=.env.local scripts/check-roblox-identity-db-preflight.mjs
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

async function main() {
  const source = resolveRobloxIdentitySource(process.env.ROBLOX_IDENTITY_SOURCE);
  console.log(`ROBLOX_IDENTITY_SOURCE resolved to: ${source}`);

  if (source !== "db") {
    console.log(
      "JSON rollback is active for this run; DB preflight has nothing to validate. " +
        "The resolver will run against src/config/roblox-universe-ids.json.",
    );
    return;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  console.log(`Target Supabase project: ${targetHostname()}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  let identity;
  try {
    identity = await loadRobloxIdentityForScript({ supabase, env: { ROBLOX_IDENTITY_SOURCE: "db" } });
  } catch (error) {
    console.error(
      `DB preflight FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(describeRobloxIdentity(identity));
  console.log(
    `  verified: ${identity.counts.verified}  not_roblox: ${identity.counts.not_roblox}  ` +
      `needs_review: ${identity.counts.needs_review}`,
  );
  console.log("\nDB preflight OK. public.game_roblox_identity is safe for the resolver to read.");
}

main().catch((err) => {
  console.error(
    `DB preflight could not run: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 2;
});
