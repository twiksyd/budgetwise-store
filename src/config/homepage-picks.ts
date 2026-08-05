// Business-owner-editable: pins the homepage "Jump back into what you
// play" section to these specific games (by id, from store_games) instead
// of just showing whatever sorts first. Display order follows this list.
// IDs queried live from Supabase, not guessed from names.
export const continuePlayingGameIds: string[] = [
  "ca3463cd-4033-4505-b6a8-441d450df10a", // Drag Drive Simulator
  "ec7b0020-d616-485b-a151-f5fc2d541c9b", // Grow a garden 2
];
