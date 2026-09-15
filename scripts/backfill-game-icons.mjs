// Manual, human-triggered game-icon discovery workflow (re-runnable).
//
// Tries each game's verified Roblox identity first (ROBLOX_IDENTITY_SOURCE:
// json = src/config/roblox-universe-ids.json, the default; db =
// public.game_roblox_identity), then falls back to fuzzy-matching the game's
// name against Roblox's public search when no verified identity exists. That
// fuzzy fallback makes this workflow unsafe for unattended automation — a
// wrong guess would confidently display the wrong game's official artwork.
// Run it by hand, review the "Needs manual review" output, and verify the
// identity for anything real before re-running.
//
// With the db source, games whose identity is not_roblox or needs_review are
// explicit decisions and are never fuzzy-matched. The json source cannot
// express those states, so json behavior is unchanged.
//
// Identity is loaded before any write; if it cannot be read the run stops
// with nothing written. This script never writes Roblox identity.
//
// For unattended/automated resolution (cron, admin action, scheduled
// worker), use backfill-game-icons-deterministic.mjs instead — it only
// resolves games with a verified identity and never guesses.
//
// Run with: node --env-file=.env.local scripts/backfill-game-icons.mjs
import { createClient } from "@supabase/supabase-js";
import { fetchIconUrl, findConfidentMatch } from "./lib/roblox-icon-resolver.mjs";
import {
  describeRobloxIdentity,
  loadRobloxIdentityForScript,
} from "./lib/roblox-identity-source.mjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function resolveGameIcon(game, identity) {
  const configuredUniverseId = identity.getVerifiedUniverseId(game.id);
  if (configuredUniverseId) {
    return {
      matchName: `configured universe ${configuredUniverseId}`,
      iconUrl: await fetchIconUrl(configuredUniverseId),
    };
  }

  const status = identity.getStatus(game.id);
  if (status === "not_roblox" || status === "needs_review") {
    return { skippedStatus: status };
  }

  const match = await findConfidentMatch(game.name, game.aliases);
  if (!match) return null;

  return {
    matchName: match.name,
    iconUrl: await fetchIconUrl(match.universeId),
  };
}

async function main() {
  const identity = await loadRobloxIdentityForScript({ supabase });
  console.log(describeRobloxIdentity(identity));

  const { data: games, error } = await supabase
    .from("games")
    .select("id, name, aliases, icon_url")
    .is("icon_url", null);

  if (error) throw error;

  console.log(`${games.length} game(s) missing icon_url.\n`);

  const skipped = [];
  let updated = 0;

  for (const game of games) {
    try {
      const resolved = await resolveGameIcon(game, identity);

      if (resolved?.skippedStatus) {
        skipped.push(game.name);
        console.log(`⊘ Identity is ${resolved.skippedStatus}, not guessed: "${game.name}"`);
        continue;
      }

      if (!resolved) {
        skipped.push(game.name);
        console.log(`⨯ No confident match: "${game.name}"`);
        continue;
      }

      if (!resolved.iconUrl) {
        skipped.push(game.name);
        console.log(`⨯ No icon returned: "${game.name}"`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("games")
        .update({ icon_url: resolved.iconUrl })
        .eq("id", game.id);

      if (updateError) throw updateError;

      updated++;
      console.log(`✓ "${game.name}" → matched "${resolved.matchName}"`);
    } catch (err) {
      skipped.push(game.name);
      console.log(`⨯ Error on "${game.name}": ${err.message}`);
    }

    // Be polite to Roblox's API.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log(`\nDone. Updated ${updated}/${games.length}.`);
  if (skipped.length > 0) {
    console.log(`\nNeeds manual review (${skipped.length}):`);
    skipped.forEach((name) => console.log(`  - ${name}`));
  }
}

main().catch((err) => {
  console.error(`Icon backfill failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
