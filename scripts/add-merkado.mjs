import { createClient } from "@supabase/supabase-js";

// Merkado was absent from the production catalog when this update was prepared.
// The requested list is therefore added as a new game, with no old rows to hide.
const gameName = "Merkado";
const desired = [
  ["Inferno Stall", 199, 79, 59.7],
  ["Autumn Wings", 299, 109, 89.7],
  ["Mystic Wings", 299, 109, 89.7],
  ["Mystic Staff", 399, 145, 119.7],
  ["Mystic Bundle", 499, 179, 149.7],
  ["Hellfire Horse", 599, 215, 179.7],
  ["Guardian Sword", 299, 109, 89.7],
  ["VIP", 99, 39, 29.7],
  ["2x Cash", 149, 59, 44.7],
  ["Bigger Stock", 79, 29, 23.7],
  ["Quick Buy", 299, 109, 89.7],
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Catalog credentials are missing");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const norm = (name) => name.trim().toLowerCase();
if (new Set(desired.map(([name]) => norm(name))).size !== desired.length) throw new Error("Duplicate desired product names");

// Check the complete game list and the catalog owner before writing anything.
const { data: games, count, error: gamesError } = await supabase.from("games")
  .select("id,user_id,name,sort_order", { count: "exact" });
if (gamesError) throw gamesError;
if (games.length !== count) throw new Error("Incomplete game inventory");
const owners = [...new Set(games.map((game) => game.user_id))];
if (owners.length !== 1 || !owners[0]) throw new Error("Unexpected game catalog owner");
const matches = games.filter((game) => norm(game.name) === norm(gameName));
if (matches.length > 1) throw new Error("Multiple Merkado games exist; no change made");
let gameId = matches[0]?.id;
if (matches.length === 1 && matches[0].user_id !== owners[0]) throw new Error("Unexpected Merkado owner");

if (!gameId) {
  const sortOrder = Math.max(0, ...games.map((game) => game.sort_order ?? 0)) + 1;
  const { data: created, error: insertError } = await supabase.from("games")
    .insert({
      user_id: owners[0], name: gameName, category: null, color: "#22c55e",
      icon_url: null, sort_order: sortOrder, is_discounted: false,
      availability_status: "available",
    })
    .select("id,name").single();
  if (insertError) throw insertError;
  gameId = created.id;
  console.log(`Added ${created.name} game (${gameId})`);
}

const { data: existing, count: passCount, error: passError } = await supabase.from("gamepasses")
  .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
  .eq("game_id", gameId);
if (passError) throw passError;
if (existing.length !== passCount) throw new Error("Incomplete Merkado product inventory");
const desiredNames = new Set(desired.map(([name]) => norm(name)));
if (existing.some((pass) => pass.user_id !== owners[0] || !desiredNames.has(norm(pass.name)))) {
  throw new Error("Merkado has unexpected existing products; no product changes made");
}
if (new Set(existing.map((pass) => norm(pass.name))).size !== existing.length) {
  throw new Error("Duplicate Merkado product names; no product changes made");
}
for (const [name, robux, price, cost] of desired) {
  const old = existing.find((pass) => norm(pass.name) === norm(name));
  if (old) {
    if (old.name !== name || old.robux_amount !== robux || Number(old.your_price) !== price ||
      Number(old.your_cost) !== cost || !old.is_active || old.availability_status !== "available") {
      throw new Error(`Existing ${name} differs from requested values; no replacement made`);
    }
    continue;
  }
  const { data: created, error } = await supabase.from("gamepasses")
    .insert({
      game_id: gameId, user_id: owners[0], name, robux_amount: robux,
      your_price: price, your_cost: cost, is_active: true,
      availability_status: "available",
    })
    .select("id").single();
  if (error) throw error;
  console.log(`Added ${name} (${created.id})`);
}

const { data: visibleGame, error: gameViewError } = await supabase.from("store_games")
  .select("id,name,slug,availability_status").eq("id", gameId).single();
if (gameViewError) throw gameViewError;
if (visibleGame.name !== gameName || visibleGame.slug !== "merkado" || visibleGame.availability_status !== "available") {
  throw new Error("Merkado game is not correctly visible in the public catalog");
}
const { data: listed, error: viewError } = await supabase.from("store_gamepasses")
  .select("id,name,robux_amount,price,availability_status").eq("game_id", gameId);
if (viewError) throw viewError;
if (listed.length !== desired.length) throw new Error(`Expected ${desired.length} public passes; found ${listed.length}`);
for (const [name, robux, price] of desired) {
  const row = listed.find((pass) => norm(pass.name) === norm(name));
  if (!row || row.robux_amount !== robux || Number(row.price) !== price || row.availability_status !== "available") {
    throw new Error(`Public catalog verification failed for ${name}`);
  }
}
console.log(`Verified ${visibleGame.slug}: ${listed.length} public passes`);
