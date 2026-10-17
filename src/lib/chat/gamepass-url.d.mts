export const CANONICAL_GAMEPASS_PREFIX: string;
export type GamepassParseResult =
  | { ok: true; gamepassId: string; canonicalUrl: string }
  | { ok: false; error: string };
export function parseRobloxGamepassUrl(input: unknown): GamepassParseResult;
export function describeGamepass(gamepassId: string): string;
