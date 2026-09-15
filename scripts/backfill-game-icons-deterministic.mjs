// Deterministic (unattended-automation-safe) game-icon backfill.
//
// Only resolves games with a verified Roblox identity from the configured
// source (ROBLOX_IDENTITY_SOURCE: json = src/config/roblox-universe-ids.json,
// the default; db = public.game_roblox_identity rows with status verified).
// not_roblox, needs_review, and games with no identity are skipped. Never
// guesses a game's identity via fuzzy name search — for that human-triggered
// discovery workflow, see backfill-game-icons.mjs instead.
//
// Identity is loaded before any write. If the source is invalid or cannot be
// read, the run fails with nothing written and never falls back to the other
// source. This script never writes Roblox identity.
//
// Runs daily via .github/workflows/roblox-icon-backfill.yml (after the
// identity parity gate), and can also be run by hand. Only touches rows where
// icon_url is currently null; failures leave icon_url null and remain
// retryable on the next run.
//
// Logs only safe diagnostics (target Supabase hostname, identity source and
// counts, per-game name, updated/skipped/failed counts) — never the
// service-role key or any other secret value.
//
// Run with: node --env-file=.env.local scripts/backfill-game-icons-deterministic.mjs
// (the --env-file flag is for local runs only; in CI the env vars are
// injected directly, see the workflow file)
import { createClient } from "@supabase/supabase-js";
import { resolveDeterministic } from "./lib/roblox-icon-resolver.mjs";
import {
  describeRobloxIdentity,
  loadRobloxIdentityForScript,
} from "./lib/roblox-identity-source.mjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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

  const identity = await loadRobloxIdentityForScript({ supabase });
  console.log(describeRobloxIdentity(identity));

  const { updated, skippedNoMapping, failed } = await resolveDeterministic({
    supabase,
    universeIds: identity.verifiedUniverseIds(),
  });

  for (const game of updated) {
    console.log(`✓ "${game.name}" → universe ${game.universeId}`);
  }
  for (const game of failed) {
    console.log(`⨯ "${game.name}": ${game.reason} (left null, retryable)`);
  }

  console.log(
    `\nDone. Updated ${updated.length}. Failed ${failed.length} (retryable). ` +
      `Skipped ${skippedNoMapping.length} without a verified Roblox identity (not guessed).`,
  );
  if (skippedNoMapping.length > 0) {
    console.log(
      identity.source === "db"
        ? "\nNo verified identity in public.game_roblox_identity (review in XOB) for:"
        : "\nAdd a verified mapping to src/config/roblox-universe-ids.json for:",
    );
    skippedNoMapping.forEach((name) => console.log(`  - ${name}`));
  }
}

main().catch((err) => {
  console.error(
    `Deterministic icon backfill failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
