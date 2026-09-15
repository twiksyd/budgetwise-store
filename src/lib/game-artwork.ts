// Store-owned copies of official game icons, keyed by the existing XOB game ID.
// Manual last-resort override for a specific game's icon when the database
// icon_url is empty and no automatic Roblox resolution applies. Not a
// product Game Pass synchronization mapping.
const cachedGameIcons: Readonly<Record<string, string>> = {};

export function withGameArtwork<T extends { id: string; icon_url: string | null }>(
  game: T,
): T {
  return {
    ...game,
    icon_url: game.icon_url || cachedGameIcons[game.id] || null,
  };
}
