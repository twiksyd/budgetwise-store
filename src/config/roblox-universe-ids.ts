import universeIds from "./roblox-universe-ids.json";

// Store-owned mapping of storefront games -> their real Roblox universe id.
//
// This is a plain, human-populated JSON file, not something ever
// auto-discovered by searching Roblox for a game by name. That matters:
// verified while building the pilot that the top search result for "Grow a
// Garden" resolves to a different, nearly-empty Roblox universe than the
// one actually behind our "Grow a garden 2" catalog entry — confirmed only
// by cross-referencing real product names (Grappling Hook, Power Hose,
// Vine Wrapper) against each candidate universe's actual game pass list.
// Auto-matching game *identity* by name is exactly the kind of low-
// confidence guess this system is designed never to make — a wrong
// universe id here would display a completely different game's official
// artwork with full confidence, which is worse than a placeholder. Add new
// entries only after that same kind of manual verification (search for
// candidates, fetch each candidate's real game pass list, only accept one
// that shares multiple exact-name products with what we actually sell).
//
// Every entry currently in roblox-universe-ids.json was confirmed this way,
// each with at least 2-3 (usually 5+) exact product-name overlaps against
// the live Roblox game pass list — never on name-similarity alone.
//
// Deliberately NOT configured — needs manual follow-up, don't guess:
//   - Build a ring farm (c1855e24-3f0b-4f18-b97f-508f51df2f3f) — the one
//     found candidate universe currently has zero Game Passes to check
//     against (all its products are likely Developer Products already).
//   - Evomon (49b001cd-30a1-4062-a564-b78f646fb2fa) — only "VIP" overlapped,
//     too generic/common a name across unrelated games to trust alone.
//   - Gakuran (3a0172bd-0594-414a-af6e-50fba7172f03) — zero overlap found.
//   - Redliner (2570b17e-6df8-4c31-88f2-ed119f7eb51e) — candidate universe
//     has zero Game Passes to check against.
//   - Strongest Battlegrounds (9e061a43-d4e2-4375-bdb0-d4f371d35fe7) — TWO
//     live, similarly-named candidate universes each partially matched our
//     products (5/8 and 3/5 overlaps) — genuinely ambiguous which is ours,
//     so neither was added.
//   - Survive the Apocalypse (a74ef492-4241-477e-9761-526533d0ae06) — the
//     found candidate universe has zero Game Passes to check against.
//
// scripts/sync-roblox-gamepasses.mjs reads roblox-universe-ids.json
// directly (plain JSON, no TS build step needed for the standalone script);
// this file is the typed entry point for the Next.js app.
export const robloxUniverseIds: Record<string, number> = universeIds;
