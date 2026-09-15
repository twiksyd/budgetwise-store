// Typed as .d.mts for the ".mjs" import specifier (see order-snapshot.d.mts).

export type RobloxIdentitySource = "json" | "db";

/** unreviewed = no identity row (db) or no mapping (json). */
export type RobloxIdentityStatus =
  | "verified"
  | "not_roblox"
  | "needs_review"
  | "unreviewed";

export interface RobloxIdentity {
  readonly source: RobloxIdentitySource;
  readonly counts: Readonly<{
    verified: number;
    not_roblox: number;
    needs_review: number;
  }>;
  getStatus(gameId: string): RobloxIdentityStatus;
  /** Positive universe id for verified games only; null otherwise. */
  getVerifiedUniverseId(gameId: string): number | null;
  isVerified(gameId: string): boolean;
  gameIdsWithStatus(status: Exclude<RobloxIdentityStatus, "unreviewed">): string[];
  verifiedUniverseIds(): Record<string, number>;
}

export type RobloxIdentityHealthConfigStatus =
  | "configured"
  | "not_configured"
  | "special_store_route"
  | "not_roblox"
  | "needs_review"
  | "unreviewed"
  | "not_available";

export interface RobloxIdentityHealthClassification {
  configurationStatus: RobloxIdentityHealthConfigStatus;
  universeId: number | null;
  /** json mode only: the legacy "missing mapping" / "not configured" checks apply. */
  legacyMappingChecks: boolean;
  /** Product "No Roblox sync record" diagnostics do not apply. */
  skipSyncDiagnostics: boolean;
  identityIssue: "needs_review" | "not_reviewed" | null;
}

export const ROBLOX_IDENTITY_SOURCES: readonly RobloxIdentitySource[];
export const DEFAULT_ROBLOX_IDENTITY_SOURCE: "json";

export class RobloxIdentityError extends Error {}

export function resolveRobloxIdentitySource(
  rawValue: string | null | undefined,
): RobloxIdentitySource;

export function buildRobloxIdentityFromJson(
  mappings: Record<string, number>,
): RobloxIdentity;

export function buildRobloxIdentityFromDbRows(
  rows: Array<{ game_id: string; status: string; universe_id: string | number | null }>,
): RobloxIdentity;

/** Any Supabase client able to SELECT public.game_roblox_identity. */
export function fetchRobloxIdentityRows(
  supabase: object,
): Promise<Array<{ game_id: string; status: string; universe_id: string | null }>>;

export function loadRobloxIdentityFromDb(supabase: object): Promise<RobloxIdentity>;

export function classifyGameRobloxIdentity(
  identity: RobloxIdentity | null,
  input: { gameId: string; gameHidden: boolean; specialStoreRoute: boolean },
): RobloxIdentityHealthClassification;
