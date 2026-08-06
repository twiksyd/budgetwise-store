import universeIds from "./roblox-universe-ids.json";

// Store-owned mapping of storefront games -> their real Roblox universe id.
// Pilot scope only (see PR/chat history) — two games, added deliberately
// one at a time.
//
// This is a plain, human-populated JSON file, not something ever
// auto-discovered by searching Roblox for a game by name. That matters:
// verified while building this that the top search result for "Grow a
// Garden" resolves to a different, nearly-empty Roblox universe than the
// one actually behind our "Grow a garden 2" catalog entry — confirmed only
// by cross-referencing real product names (Grappling Hook, Power Hose,
// Vine Wrapper) against each candidate universe's actual game pass list.
// Auto-matching game *identity* by name is exactly the kind of low-
// confidence guess this system is designed never to make — a wrong
// universe id here would display a completely different game's official
// artwork with full confidence, which is worse than a placeholder. Add new
// entries only after that same kind of manual verification.
//
// scripts/sync-roblox-gamepasses.mjs reads roblox-universe-ids.json
// directly (plain JSON, no TS build step needed for the standalone script);
// this file is the typed entry point for the Next.js app.
export const robloxUniverseIds: Record<string, number> = universeIds;
