import "server-only";
import { cache } from "react";
// The only runtime import of the legacy JSON config (via its typed entry
// point). Everything else asks this loader.
import { robloxUniverseIds } from "@/config/roblox-universe-ids";
import {
  buildRobloxIdentityFromJson,
  loadRobloxIdentityFromDb,
  resolveRobloxIdentitySource,
  type RobloxIdentity,
  type RobloxIdentitySource,
} from "@/lib/roblox-identity-core.mjs";
import { createAdminClient } from "@/lib/supabase/admin";

export type {
  RobloxIdentity,
  RobloxIdentitySource,
  RobloxIdentityStatus,
} from "@/lib/roblox-identity-core.mjs";

export type RobloxIdentityResult =
  | { ok: true; source: RobloxIdentitySource; identity: RobloxIdentity }
  | { ok: false; source: RobloxIdentitySource | null; identity: null; error: string };

let jsonIdentity: RobloxIdentity | null = null;

/** Throws on any value other than unset, "json", or "db". */
export function getRobloxIdentitySource(): RobloxIdentitySource {
  return resolveRobloxIdentitySource(process.env.ROBLOX_IDENTITY_SOURCE);
}

/**
 * Strict: throws when the configured source cannot be read. In db mode a
 * failed query never falls back to JSON — that would hide database drift.
 * Deduplicated per request.
 */
export const getRobloxIdentity = cache(async (): Promise<RobloxIdentity> => {
  const source = getRobloxIdentitySource();
  if (source === "json") {
    jsonIdentity ??= buildRobloxIdentityFromJson(robloxUniverseIds);
    return jsonIdentity;
  }
  return loadRobloxIdentityFromDb(createAdminClient());
});

/**
 * Non-throwing variant for storefront presentation and health diagnostics:
 * failures are logged and reported as { ok: false } with no identity, never
 * replaced by another source.
 */
export const getRobloxIdentitySafe = cache(async (): Promise<RobloxIdentityResult> => {
  let source: RobloxIdentitySource | null = null;
  try {
    source = getRobloxIdentitySource();
    const identity = await getRobloxIdentity();
    return { ok: true, source, identity };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Roblox identity failure";
    console.error(`Roblox identity unavailable (source: ${source ?? "invalid"}): ${message}`);
    return { ok: false, source, identity: null, error: message };
  }
});
