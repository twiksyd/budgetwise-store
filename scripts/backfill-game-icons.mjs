// Manual, human-triggered game-icon discovery workflow (re-runnable).
//
// Tries each game's configured universeId first (src/config/roblox-universe-ids.json),
// then falls back to fuzzy-matching the game's name against Roblox's public
// search when no mapping exists. That fuzzy fallback makes this workflow
// unsafe for unattended automation — a wrong guess would confidently
// display the wrong game's official artwork. Run it by hand, review the
// "Needs manual review" output, and add a verified mapping to
// roblox-universe-ids.json for anything real before re-running.
//
// For unattended/automated resolution (cron, admin action, scheduled
// worker), use backfill-game-icons-deterministic.mjs instead — it only
// resolves games with an explicit mapping and never guesses.
//
// Run with: node --env-file=.env.local scripts/backfill-game-icons.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { fetchIconUrl, findConfidentMatch } from "./lib/roblox-icon-resolver.mjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const configuredUniverseIds = JSON.parse(
  readFileSync(join(process.cwd(), "src/config/roblox-universe-ids.json"), "utf8"),
);

async function resolveGameIcon(game) {
  const configuredUniverseId = configuredUniverseIds[game.id];
  if (configuredUniverseId) {
    return {
      matchName: `configured universe ${configuredUniverseId}`,
      iconUrl: await fetchIconUrl(configuredUniverseId),
    };
  }

  const match = await findConfidentMatch(game.name, game.aliases);
  if (!match) return null;

  return {
    matchName: match.name,
    iconUrl: await fetchIconUrl(match.universeId),
  };
}

async function main() {
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
      const resolved = await resolveGameIcon(game);

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

main();
