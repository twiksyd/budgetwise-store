// Deterministic (unattended-automation-safe) game-icon backfill.
//
// Only resolves games that already have an explicit, human-verified
// universeId mapping in src/config/roblox-universe-ids.json. Never guesses
// a game's identity via fuzzy name search — for that human-triggered
// discovery workflow, see backfill-game-icons.mjs instead.
//
// Runs daily via .github/workflows/roblox-icon-backfill.yml, and can also
// be run by hand or from another scheduled worker / admin action. Only
// touches rows where icon_url is currently null; failures leave icon_url
// null and remain retryable on the next run.
//
// Logs only safe diagnostics (target Supabase hostname, per-game name,
// updated/skipped/failed counts) — never the service-role key or any other
// secret value.
//
// Run with: node --env-file=.env.local scripts/backfill-game-icons-deterministic.mjs
// (the --env-file flag is for local runs only; in CI the env vars are
// injected directly, see the workflow file)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveDeterministic } from "./lib/roblox-icon-resolver.mjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const universeIds = JSON.parse(
  readFileSync(join(process.cwd(), "src/config/roblox-universe-ids.json"), "utf8"),
);

function targetHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "(unparseable NEXT_PUBLIC_SUPABASE_URL)";
  }
}

async function main() {
  console.log(`Target Supabase project: ${targetHostname()}`);

  const { updated, skippedNoMapping, failed } = await resolveDeterministic({
    supabase,
    universeIds,
  });

  for (const game of updated) {
    console.log(`✓ "${game.name}" → universe ${game.universeId}`);
  }
  for (const game of failed) {
    console.log(`⨯ "${game.name}": ${game.reason} (left null, retryable)`);
  }

  console.log(
    `\nDone. Updated ${updated.length}. Failed ${failed.length} (retryable). ` +
      `Skipped ${skippedNoMapping.length} with no universeId mapping (not guessed).`,
  );
  if (skippedNoMapping.length > 0) {
    console.log(`\nAdd a verified mapping to src/config/roblox-universe-ids.json for:`);
    skippedNoMapping.forEach((name) => console.log(`  - ${name}`));
  }
}

main();
