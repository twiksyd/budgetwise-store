// Store-owned copies of official game icons, keyed by the existing XOB game ID.
// Karinderya's experience was confirmed by the owner: place 116497287371701,
// universe 10648820673. This is not a product Game Pass synchronization mapping.
const cachedGameIcons: Readonly<Record<string, string>> = {
  "84372024-ee1c-43a0-bbfb-6227c43039d3":
    "/icons/karinderya-10648820673.png",
};

export function withGameArtwork<T extends { id: string; icon_url: string | null }>(
  game: T,
): T {
  return {
    ...game,
    icon_url: game.icon_url || cachedGameIcons[game.id] || null,
  };
}
