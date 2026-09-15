// Read-only parity check between the trusted Store Roblox identity config
// (src/config/roblox-universe-ids.json) and XOB's
// public.game_roblox_identity rows with status = 'verified'.
//
// During the identity rollout transition both sources must agree exactly:
// same game ids, same universe id per game, nothing missing, nothing extra.
// Exits 0 on parity, 1 on a parity failure, 2 if the check could not run.
//
// This script only ever SELECTs. The service-role key it uses has SELECT and
// nothing else on game_roblox_identity (XOB migration 063), so it cannot
// change identity even by mistake. Logs only the target Supabase hostname,
// never the key.
//
// Run with: node --env-file=.env.local scripts/check-roblox-identity-parity.mjs
// Fixture mode (no network): --db-rows-file <path> reads a JSON array of
// { game_id, universe_id } verified rows instead of querying Supabase.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import {
  TRUSTED_MAPPINGS_PATH,
  compareIdentityParity,
  parseTrustedMappings,
} from "./lib/roblox-identity-parity.mjs";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function targetHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "(unparseable NEXT_PUBLIC_SUPABASE_URL)";
  }
}

async function readVerifiedRows() {
  const fixturePath = argValue("--db-rows-file");
  if (fixturePath) {
    console.log(`DB source: fixture ${fixturePath}`);
    return JSON.parse(readFileSync(fixturePath, "utf8"));
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  console.log(`DB source: Supabase project ${targetHostname()}`);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const { data, error, count } = await supabase
    .from("game_roblox_identity")
    .select("game_id, universe_id:universe_id::text", { count: "exact" })
    .eq("status", "verified")
    .order("game_id");

  if (error) throw new Error(`game_roblox_identity read failed: ${error.message}`);
  if (data.length !== count) {
    throw new Error(`Read ${data.length} of ${count} verified rows; refusing to compare a partial result`);
  }
  return data;
}

async function main() {
  const trusted = parseTrustedMappings(
    readFileSync(join(process.cwd(), TRUSTED_MAPPINGS_PATH), "utf8"),
  );
  const result = compareIdentityParity(trusted, await readVerifiedRows());

  console.log(
    `JSON mappings: ${result.json_count}. DB verified identities: ${result.db_verified_count}.`,
  );
  for (const key of ["missing_in_db", "extra_in_db", "universe_id_mismatch"]) {
    console.log(`${key}: ${result[key].length}`);
    for (const entry of result[key]) console.log(`  ${JSON.stringify(entry)}`);
  }

  console.log(result.ok ? "\nParity OK." : "\nParity FAILED.");
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(`Parity check could not run: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 2;
});
