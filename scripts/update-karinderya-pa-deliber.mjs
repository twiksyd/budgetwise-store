import { createClient } from "@supabase/supabase-js";

// One-time catalog update. Retain existing IDs for order history, and hide
// removed products instead of deleting them.
const catalogs = [
  {
    gameId: "84372024-ee1c-43a0-bbfb-6227c43039d3",
    gameName: "Karinderya",
    originalVisible: ["Double Cash", "Double Luck", "Lightning Pass", "Nimbuslux Set", "Premium Cloud Black", "Premium Cloud White", "Super Dog", "Ultra Lucky", "VIP Pass"],
    desired: [
      ["VIP Pass", 259, 105, 77.7],
      ["Starter Pack", 29, 12, 8.7],
      ["Nimbuslux Set", 659, 235, 197.7],
      ["Pink Streamer Set", 299, 115, 89.7],
      ["Blue Streamer Set", 299, 115, 89.7],
      ["Double Cash", 39, 15, 11.7],
      ["Double Luck", 39, 15, 11.7],
      ["Ultra Lucky", 99, 39, 29.7],
      ["Lightning Pass", 799, 295, 239.7],
    ],
  },
  {
    gameId: "d2170ae6-1142-4106-99f1-3026ef057a8a",
    gameName: "Pa Deliber",
    originalVisible: ["Ghost Rider Bike", "Long lasting gas", "Php 100k", "Php 500k", "Premium pack", "Rainbow Unicorn Bag", "Slow Hunger And Thirst", "Starter Pack", "VIP Pass"],
    desired: [
      ["VIP Pass", 349, 125, 104.7],
      ["Long lasting gas", 419, 149, 125.7],
      ["Starter Pack", 49, 19, 14.7],
      ["Premium pack", 99, 39, 29.7],
      ["Slow Hunger And Thirst", 119, 49, 35.7],
      ["Cute Owl", 349, 125, 104.7],
      ["Rainbow Unicorn Bag", 229, 89, 68.7],
      ["Php 500k", 649, 235, 194.7],
      ["Php 100k", 149, 59, 44.7],
      ["Sakura E-Bike", 599, 215, 179.7],
      ["Rainbow Unicorn House", 699, 249, 209.7],
    ],
  },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Catalog credentials are missing");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const norm = (value) => value.trim().toLowerCase();
const fields = "id,user_id,game_id,name,robux_amount,your_price,your_cost,is_active,availability_status";

// Finish all read-only checks for both games before the first write.
const snapshots = [];
for (const catalog of catalogs) {
  const { data: game, error: gameError } = await supabase.from("games").select("id,name").eq("id", catalog.gameId).single();
  if (gameError) throw gameError;
  if (norm(game.name) !== norm(catalog.gameName)) throw new Error(`Wrong game at ${catalog.gameId}`);
  const { data: passes, count, error: passError } = await supabase.from("gamepasses")
    .select(fields, { count: "exact" }).eq("game_id", catalog.gameId);
  if (passError) throw passError;
  if (passes.length !== count) throw new Error(`Incomplete ${catalog.gameName} inventory`);
  const owners = [...new Set(passes.map((pass) => pass.user_id))];
  if (owners.length !== 1 || !owners[0]) throw new Error(`Unexpected ${catalog.gameName} owner`);
  const names = passes.map((pass) => norm(pass.name));
  if (new Set(names).size !== names.length) throw new Error(`Duplicate ${catalog.gameName} product names`);
  const desiredNames = catalog.desired.map(([name]) => norm(name));
  if (new Set(desiredNames).size !== desiredNames.length) throw new Error(`Duplicate desired ${catalog.gameName} names`);
  const currentVisible = passes.filter((pass) => pass.is_active && pass.availability_status !== "hidden").map((pass) => norm(pass.name));
  const allowedVisible = new Set([...catalog.originalVisible.map(norm), ...desiredNames]);
  if (currentVisible.some((name) => !allowedVisible.has(name))) throw new Error(`Unexpected visible ${catalog.gameName} product; no write made`);
  snapshots.push({ catalog, passes, owner: owners[0] });
}

for (const { catalog, passes, owner } of snapshots) {
  const desiredNames = new Set(catalog.desired.map(([name]) => norm(name)));
  for (const [name, robux, price, cost] of catalog.desired) {
    const expected = {
      name, robux_amount: robux, your_price: price, your_cost: cost,
      is_active: true, availability_status: "available",
    };
    const old = passes.find((pass) => norm(pass.name) === norm(name));
    if (!old) {
      const { data, error } = await supabase.from("gamepasses")
        .insert({ ...expected, game_id: catalog.gameId, user_id: owner }).select("id").single();
      if (error) throw error;
      console.log(`${catalog.gameName}: added ${name} (${data.id})`);
    } else if (
      old.name !== name || old.robux_amount !== robux || Number(old.your_price) !== price ||
      Number(old.your_cost) !== cost || !old.is_active || old.availability_status !== "available"
    ) {
      const { data, error } = await supabase.from("gamepasses")
        .update(expected).eq("id", old.id).eq("game_id", catalog.gameId).select("id").single();
      if (error) throw error;
      console.log(`${catalog.gameName}: updated ${name} (${data.id})`);
    }
  }
  for (const old of passes) {
    if (desiredNames.has(norm(old.name)) || (!old.is_active && old.availability_status === "hidden")) continue;
    const { data, error } = await supabase.from("gamepasses")
      .update({ is_active: false, availability_status: "hidden" })
      .eq("id", old.id).eq("game_id", catalog.gameId).select("id").single();
    if (error) throw error;
    console.log(`${catalog.gameName}: hid ${old.name} (${data.id})`);
  }

  const { data: raw, count, error: rawError } = await supabase.from("gamepasses")
    .select(fields, { count: "exact" }).eq("game_id", catalog.gameId);
  if (rawError) throw rawError;
  if (raw.length !== count) throw new Error(`Incomplete ${catalog.gameName} verification`);
  const { data: listed, error: viewError } = await supabase.from("store_gamepasses")
    .select("id,name,robux_amount,price,availability_status").eq("game_id", catalog.gameId);
  if (viewError) throw viewError;
  if (listed.length !== catalog.desired.length) throw new Error(`${catalog.gameName}: wrong public product count`);
  for (const [name, robux, price, cost] of catalog.desired) {
    const row = raw.find((pass) => norm(pass.name) === norm(name));
    const publicRow = listed.find((pass) => pass.id === row?.id);
    if (!row || !row.is_active || row.availability_status !== "available" ||
      row.robux_amount !== robux || Number(row.your_price) !== price || Number(row.your_cost) !== cost ||
      !publicRow || publicRow.robux_amount !== robux || Number(publicRow.price) !== price ||
      publicRow.availability_status !== "available") {
      throw new Error(`${catalog.gameName}: verification failed for ${name}`);
    }
  }
  console.log(`${catalog.gameName}: verified ${listed.length} public passes`);
}
