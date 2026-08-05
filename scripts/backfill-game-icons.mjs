// One-time (re-runnable) maintenance script: fills in games.icon_url by
// matching each game's name against Roblox's public search, using the
// official game icon as the source image. Only touches rows where
// icon_url is currently null, and only when it finds a confident exact
// name match — anything ambiguous is skipped and reported, not guessed.
//
// Run with: node --env-file=.env.local scripts/backfill-game-icons.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip emojis/symbols, keep letters/numbers
    .replace(/\s+/g, " ")
    .trim();
}

async function searchRoblox(query) {
  const sessionId = crypto.randomUUID();
  const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&sessionId=${sessionId}&pageToken=&verticalType=game`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();

  const results = [];
  for (const group of data.searchResults ?? []) {
    for (const content of group.contents ?? []) {
      if (content.contentType === "Game" && content.universeId) {
        results.push({ universeId: content.universeId, name: content.name });
      }
    }
  }
  return results;
}

async function fetchIconUrl(universeId) {
  const url = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Icon fetch failed: ${res.status}`);
  const data = await res.json();
  return data.data?.[0]?.imageUrl ?? null;
}

async function findConfidentMatch(name, aliases) {
  const targets = [name, ...(aliases ?? [])].map(normalize);
  const results = await searchRoblox(name);

  for (const result of results) {
    const candidate = normalize(result.name);
    if (targets.includes(candidate)) return result;
  }

  // Roblox listings often wrap the real title in event/update decoration
  // ("Anime Vanguards: Extermination Event Pt. 2", "Welcome to Bloxburg").
  // Fall back to a substring match on the no-space form, but only when
  // exactly one result qualifies and the target isn't so short it'd match
  // almost anything.
  const despacedTargets = targets
    .map((t) => t.replace(/\s+/g, ""))
    .filter((t) => t.length >= 6);

  if (despacedTargets.length > 0) {
    const substringMatches = results.filter((result) => {
      const candidate = normalize(result.name).replace(/\s+/g, "");
      return despacedTargets.some((t) => candidate.includes(t));
    });
    if (substringMatches.length === 1) return substringMatches[0];
  }

  return null;
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
      const match = await findConfidentMatch(game.name, game.aliases);

      if (!match) {
        skipped.push(game.name);
        console.log(`⨯ No confident match: "${game.name}"`);
        continue;
      }

      const iconUrl = await fetchIconUrl(match.universeId);
      if (!iconUrl) {
        skipped.push(game.name);
        console.log(`⨯ No icon returned: "${game.name}"`);
        continue;
      }

      const { error: updateError } = await supabase
        .from("games")
        .update({ icon_url: iconUrl })
        .eq("id", game.id);

      if (updateError) throw updateError;

      updated++;
      console.log(`✓ "${game.name}" → matched "${match.name}"`);
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
