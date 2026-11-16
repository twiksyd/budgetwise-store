import { createClient } from "@supabase/supabase-js";

// Keep the original Markado game and product IDs. Archive the duplicate game
// created under the misspelling; retain its rows for any order references.
const originalId = "127cc7aa-0c0b-46bb-8267-f228403ba68b";
const duplicateId = "88faeed8-f356-4f06-8dfc-754856f61468";
const originalNames = [
  "2x Cash", "Angel Wings", "Big Boxx", "Bigger Stock", "Candy Bag",
  "Candy Bucket", "Candy Cauldron", "Instant Restock", "Pocket Money",
  "Puhunan", "Tanod Shield", "VIP",
];
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
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const norm = (name) => name.trim().toLowerCase();
const passFields = "id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status";
const desiredNames = new Set(desired.map(([name]) => norm(name)));
if (desiredNames.size !== desired.length) throw new Error("Duplicate desired Markado names");

// Validate both games and complete inventories before changing anything.
const { data: games, error: gameError } = await admin.from("games")
  .select("id,user_id,name,availability_status").in("id", [originalId, duplicateId]);
if (gameError) throw gameError;
if (games.length !== 2) throw new Error("Expected original and duplicate Markado games");
const original = games.find((game) => game.id === originalId);
const duplicate = games.find((game) => game.id === duplicateId);
if (original?.name !== "Markado" || original.availability_status !== "available" ||
  !original.user_id || duplicate?.user_id !== original.user_id ||
  !["Markado", "Markado (archived duplicate)"].includes(duplicate.name)) {
  throw new Error("Unexpected Markado game state");
}
const inventories = [];
for (const gameId of [originalId, duplicateId]) {
  const { data: passes, count, error } = await admin.from("gamepasses")
    .select(passFields, { count: "exact" }).eq("game_id", gameId);
  if (error) throw error;
  if (passes.length !== count || passes.some((pass) => pass.user_id !== original.user_id)) {
    throw new Error("Incomplete or mismatched Markado inventory");
  }
  if (new Set(passes.map((pass) => norm(pass.name))).size !== passes.length) throw new Error("Duplicate Markado pass names");
  inventories.push(passes);
}
const [originalPasses, duplicatePasses] = inventories;
const allowedOriginal = new Set([...originalNames.map(norm), ...desiredNames]);
if (originalPasses.some((pass) => !allowedOriginal.has(norm(pass.name)))) throw new Error("Unexpected original Markado product");
if (duplicatePasses.length !== desired.length || duplicatePasses.some((pass) => !desiredNames.has(norm(pass.name)))) {
  throw new Error("Unexpected duplicate Markado products");
}

for (const [name, robux, price, cost] of desired) {
  const values = {
    name, robux_amount: robux, your_price: price, your_cost: cost,
    is_active: true, availability_status: "available",
  };
  const old = originalPasses.find((pass) => norm(pass.name) === norm(name));
  if (!old) {
    const { data, error } = await admin.from("gamepasses")
      .insert({ ...values, game_id: originalId, user_id: original.user_id })
      .select("id").single();
    if (error) throw error;
    console.log(`Original Markado: added ${name} (${data.id})`);
  } else if (old.name !== name || old.robux_amount !== robux || Number(old.your_price) !== price ||
    Number(old.your_cost) !== cost || !old.is_active || old.availability_status !== "available") {
    const { data, error } = await admin.from("gamepasses")
      .update(values).eq("id", old.id).eq("game_id", originalId).select("id").single();
    if (error) throw error;
    console.log(`Original Markado: updated ${name} (${data.id})`);
  }
}
for (const pass of originalPasses) {
  if (desiredNames.has(norm(pass.name)) || (!pass.is_active && pass.availability_status === "hidden")) continue;
  const { error } = await admin.from("gamepasses")
    .update({ is_active: false, availability_status: "hidden" })
    .eq("id", pass.id).eq("game_id", originalId);
  if (error) throw error;
  console.log(`Original Markado: hid ${pass.name}`);
}
for (const pass of duplicatePasses) {
  if (!pass.is_active && pass.availability_status === "hidden") continue;
  const { error } = await admin.from("gamepasses")
    .update({ is_active: false, availability_status: "hidden" })
    .eq("id", pass.id).eq("game_id", duplicateId);
  if (error) throw error;
}
if (duplicate.name !== "Markado (archived duplicate)" || duplicate.availability_status !== "hidden") {
  const { error } = await admin.from("games")
    .update({ name: "Markado (archived duplicate)", availability_status: "hidden" })
    .eq("id", duplicateId);
  if (error) throw error;
  console.log("Archived duplicate Markado game and passes");
}

const { data: publicGames, error: publicGameError } = await publicClient.from("store_games")
  .select("id,name,slug,availability_status").eq("slug", "markado");
if (publicGameError) throw publicGameError;
if (publicGames.length !== 1 || publicGames[0].id !== originalId) {
  throw new Error("Public Markado slug is not unique to the original game");
}
const { data: publicPasses, error: publicPassError } = await publicClient.from("store_gamepasses")
  .select("id,game_id,name,robux_amount,price,availability_status").in("game_id", [originalId, duplicateId]);
if (publicPassError) throw publicPassError;
if (publicPasses.length !== desired.length || publicPasses.some((pass) => pass.game_id !== originalId)) {
  throw new Error("Incorrect public Markado product count or owner");
}
for (const [name, robux, price] of desired) {
  const row = publicPasses.find((pass) => norm(pass.name) === norm(name));
  if (!row || row.robux_amount !== robux || Number(row.price) !== price || row.availability_status !== "available") {
    throw new Error(`Public Markado verification failed for ${name}`);
  }
}
console.log(`Verified original Markado at /games/markado with ${publicPasses.length} public passes`);
