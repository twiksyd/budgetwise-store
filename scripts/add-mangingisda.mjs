import { createClient } from "@supabase/supabase-js";

const gameName = "Mangingisda";
const gameSlug = "mangingisda";
const desired = [
  ["Kidlat", 799, 295, 239.7],
  ["Abyssal Lure", 799, 295, 239.7],
  ["Paraw ng Kidlat", 449, 159, 134.7],
  ["Galyon ng Maynila", 549, 199, 164.7],
  ["VIP", 299, 109, 89.7],
  ["Boat Call", 149, 59, 44.7],
  ["Sell anywhere", 199, 79, 59.7],
  ["Tackle Box", 99, 39, 29.7],
  ["Bigger Pail", 249, 99, 74.7],
  ["2x Stamina", 199, 79, 59.7],
  ["Radio", 99, 39, 29.7],
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const norm = (name) => name.trim().toLowerCase();
const slug = (name) => norm(name).replace(/[^a-z0-9]+/g, "-");
const passFields = "id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status";
if (new Set(desired.map(([name]) => norm(name))).size !== desired.length) throw new Error("Duplicate desired pass names");

// Check every game name and derived URL before writing. A slug collision
// makes a customer page fail even when the game records have different names.
const { data: games, count: gameCount, error: gameError } = await admin.from("games")
  .select("id,user_id,name,sort_order", { count: "exact" });
if (gameError) throw gameError;
if (games.length !== gameCount) throw new Error("Incomplete game inventory");
const owners = [...new Set(games.map((game) => game.user_id))];
if (owners.length !== 1 || !owners[0]) throw new Error("Unexpected game catalog owner");
const matches = games.filter((game) => slug(game.name) === gameSlug);
if (matches.length > 1 || (matches.length === 1 && matches[0].name !== gameName)) {
  throw new Error("Mangingisda URL already belongs to another game");
}
let gameId = matches[0]?.id;
if (!gameId) {
  const sortOrder = Math.max(0, ...games.map((game) => game.sort_order ?? 0)) + 1;
  const { data: created, error } = await admin.from("games")
    .insert({
      user_id: owners[0], name: gameName, category: null, color: "#22c55e",
      icon_url: null, sort_order: sortOrder, is_discounted: false,
      availability_status: "available",
    })
    .select("id,name").single();
  if (error) throw error;
  gameId = created.id;
  console.log(`Added ${created.name} (${gameId})`);
}

const { data: existing, count: passCount, error: passError } = await admin.from("gamepasses")
  .select(passFields, { count: "exact" }).eq("game_id", gameId);
if (passError) throw passError;
if (existing.length !== passCount || existing.some((pass) => pass.user_id !== owners[0])) {
  throw new Error("Incomplete or mismatched Mangingisda product inventory");
}
const desiredNames = new Set(desired.map(([name]) => norm(name)));
if (existing.some((pass) => !desiredNames.has(norm(pass.name))) ||
  new Set(existing.map((pass) => norm(pass.name))).size !== existing.length) {
  throw new Error("Unexpected existing Mangingisda products; no product changes made");
}
for (const [name, robux, price, cost] of desired) {
  const old = existing.find((pass) => norm(pass.name) === norm(name));
  if (old) {
    if (old.name !== name || old.robux_amount !== robux || Number(old.your_price) !== price ||
      Number(old.your_cost) !== cost || !old.is_active || old.availability_status !== "available") {
      throw new Error(`Existing ${name} differs from requested values`);
    }
    continue;
  }
  const { data: created, error } = await admin.from("gamepasses")
    .insert({
      game_id: gameId, user_id: owners[0], name, robux_amount: robux,
      your_price: price, your_cost: cost, is_active: true,
      availability_status: "available",
    })
    .select("id").single();
  if (error) throw error;
  console.log(`Added ${name} (${created.id})`);
}

const { data: raw, count: rawCount, error: rawError } = await admin.from("gamepasses")
  .select(passFields, { count: "exact" }).eq("game_id", gameId);
if (rawError) throw rawError;
if (raw.length !== rawCount || raw.length !== desired.length) throw new Error("Incorrect raw Mangingisda pass count");
const { data: visibleGames, error: gameViewError } = await publicClient.from("store_games")
  .select("id,name,slug,availability_status").eq("slug", gameSlug);
if (gameViewError) throw gameViewError;
if (visibleGames.length !== 1 || visibleGames[0].id !== gameId || visibleGames[0].name !== gameName ||
  visibleGames[0].availability_status !== "available") {
  throw new Error("Mangingisda public page address is missing or ambiguous");
}
const { data: listed, error: viewError } = await publicClient.from("store_gamepasses")
  .select("id,name,robux_amount,price,availability_status").eq("game_id", gameId);
if (viewError) throw viewError;
if (listed.length !== desired.length) throw new Error(`Expected ${desired.length} public passes, found ${listed.length}`);
for (const [name, robux, price, cost] of desired) {
  const row = raw.find((pass) => norm(pass.name) === norm(name));
  const publicRow = listed.find((pass) => pass.id === row?.id);
  if (!row || row.robux_amount !== robux || Number(row.your_price) !== price || Number(row.your_cost) !== cost ||
    !row.is_active || row.availability_status !== "available" || !publicRow ||
    publicRow.robux_amount !== robux || Number(publicRow.price) !== price ||
    publicRow.availability_status !== "available") {
    throw new Error(`Verification failed for ${name}`);
  }
}
console.log(`Verified /games/${gameSlug} with ${listed.length} public passes`);
