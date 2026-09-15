// Script-side Roblox identity loader (no Next.js-only modules).
//
// Selects the source from ROBLOX_IDENTITY_SOURCE (unset -> json; anything but
// "json" or "db" throws) and returns the shared RobloxIdentity snapshot from
// src/lib/roblox-identity-core.mjs.
//
// Write/sync jobs must call this BEFORE any write and let a failure end the
// run: when db is selected and the query fails, this throws and never falls
// back to the JSON file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRobloxIdentityFromJson,
  loadRobloxIdentityFromDb,
  resolveRobloxIdentitySource,
} from "../../src/lib/roblox-identity-core.mjs";
import { TRUSTED_MAPPINGS_PATH, parseTrustedMappings } from "./roblox-identity-parity.mjs";

function readJsonMappings(readJsonText) {
  const text = readJsonText
    ? readJsonText()
    : readFileSync(join(process.cwd(), TRUSTED_MAPPINGS_PATH), "utf8");
  // parseTrustedMappings rejects duplicate keys and other ambiguity that a
  // plain JSON.parse would silently accept.
  const mappings = parseTrustedMappings(text);
  return Object.fromEntries([...mappings].map(([gameId, universeId]) => [gameId, Number(universeId)]));
}

export async function loadRobloxIdentityForScript({ supabase, env = process.env, readJsonText } = {}) {
  const source = resolveRobloxIdentitySource(env.ROBLOX_IDENTITY_SOURCE);
  if (source === "json") return buildRobloxIdentityFromJson(readJsonMappings(readJsonText));
  if (!supabase) throw new Error("ROBLOX_IDENTITY_SOURCE=db requires a Supabase client");
  return loadRobloxIdentityFromDb(supabase);
}

// Record<gameId, universeId> of verified identities only: the shape the
// deterministic resolver and the sync job already consume.
export async function loadVerifiedUniverseIds(options) {
  return (await loadRobloxIdentityForScript(options)).verifiedUniverseIds();
}

export function describeRobloxIdentity(identity) {
  const origin =
    identity.source === "json" ? TRUSTED_MAPPINGS_PATH : "public.game_roblox_identity";
  const { verified, not_roblox, needs_review } = identity.counts;
  return identity.source === "json"
    ? `Roblox identity source: json (${origin}), ${verified} verified mappings`
    : `Roblox identity source: db (${origin}), ${verified} verified, ${not_roblox} not_roblox, ${needs_review} needs_review`;
}
