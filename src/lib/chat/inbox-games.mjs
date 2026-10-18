// Game filter parameters (0029). "all" / missing = All games (null);
// "" = no games (General Inquiry only); otherwise unique game ids.
import { isUuid } from "../order-chat.mjs";

export const MAX_GAME_FILTER = 200;

/** null = All games, string[] = chosen ids, undefined = invalid input. */
export function parseGameIds(value) {
  if (value === null || value === undefined || value === "all") return null;
  if (typeof value !== "string") return undefined;
  if (value === "") return [];
  const ids = [...new Set(value.split(","))];
  if (ids.length > MAX_GAME_FILTER || !ids.every(isUuid)) return undefined;
  return ids;
}

/** Query-string form of a game filter. */
export function gamesParam(games) {
  return Array.isArray(games) ? games.join(",") : "all";
}
