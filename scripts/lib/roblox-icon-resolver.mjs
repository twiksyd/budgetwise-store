// Shared Roblox game-icon resolution helpers.
//
// fetchIconUrl / resolveDeterministic only ever act on a game that already
// has a verified Roblox identity (the universeIds record comes from
// scripts/lib/roblox-identity-source.mjs, verified entries only) — they never guess a game's
// identity, which makes them safe to call from unattended automation (a
// cron job, an admin maintenance action, another scheduled worker).
//
// searchRoblox / findConfidentMatch perform fuzzy name matching against
// Roblox's public search. A wrong guess there would confidently display the
// wrong game's official artwork, so these must only be invoked from a
// human-triggered workflow (see backfill-game-icons.mjs) — never wired into
// unattended automation.

export async function fetchIconUrl(universeId) {
  const url = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Icon fetch failed: ${res.status}`);
  const data = await res.json();
  return data.data?.[0]?.imageUrl ?? null;
}

// Path A: deterministic, unattended-automation-safe resolution.
// Only ever touches games that already have an explicit universeId mapping;
// anything else is left untouched (null, retryable) rather than guessed.
export async function resolveDeterministic({ supabase, universeIds }) {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, name, icon_url")
    .is("icon_url", null);

  if (error) throw error;

  const updated = [];
  const skippedNoMapping = [];
  const failed = [];

  for (const game of games) {
    const universeId = universeIds[game.id];
    if (!universeId) {
      skippedNoMapping.push(game.name);
      continue;
    }

    try {
      const iconUrl = await fetchIconUrl(universeId);
      if (!iconUrl) {
        failed.push({ name: game.name, reason: "No icon returned" });
        continue;
      }

      const { error: updateError } = await supabase
        .from("games")
        .update({ icon_url: iconUrl })
        .eq("id", game.id);
      if (updateError) throw updateError;

      updated.push({ name: game.name, universeId, iconUrl });
    } catch (err) {
      failed.push({
        name: game.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Be polite to Roblox's API.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return { updated, skippedNoMapping, failed };
}

// Path B: fuzzy discovery helpers. Human-triggered use only — see the
// module-level comment above.
export function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // strip emojis/symbols, keep letters/numbers
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchRoblox(query) {
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

export async function findConfidentMatch(name, aliases) {
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
