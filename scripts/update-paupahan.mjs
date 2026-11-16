import { createClient } from "@supabase/supabase-js";

const gameId = "3a5f3a87-cef9-4f1d-a8ec-884a2219ca55";
const originalVisible = [
  "Cash Potion", "Cloud Dream", "Flower Garden", "Luck Potion",
  "Starter Pack", "Time potion", "VIP",
];
const desired = [
  ["VIP", 249, 99, 74.7],
  ["Starter Pack", 49, 19, 14.7],
  ["Marshmallow Home Collection Indoor", 249, 99, 74.7],
  ["Marshmallow Home Collection Outdoor", 249, 99, 74.7],
  ["Adarna", 499, 179, 149.7],
  ["Once 2016", 299, 109, 89.7],
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Catalog credentials are missing");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const norm = (name) => name.trim().toLowerCase();
const fields = "id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status";

const { data: game, error: gameError } = await supabase.from("games")
  .select("id,user_id,name").eq("id", gameId).single();
if (gameError) throw gameError;
if (game.name !== "Paupahan" || !game.user_id) throw new Error("Wrong Paupahan game or owner");
const { data: passes, count, error: passError } = await supabase.from("gamepasses")
  .select(fields, { count: "exact" }).eq("game_id", gameId);
if (passError) throw passError;
if (passes.length !== count) throw new Error("Incomplete Paupahan inventory");
if (passes.some((pass) => pass.user_id !== game.user_id)) throw new Error("Unexpected Paupahan pass owner");
if (new Set(passes.map((pass) => norm(pass.name))).size !== passes.length) throw new Error("Duplicate Paupahan pass names");
const desiredNames = new Set(desired.map(([name]) => norm(name)));
if (desiredNames.size !== desired.length) throw new Error("Duplicate desired Paupahan names");
const allowedVisible = new Set([...originalVisible.map(norm), ...desiredNames]);
if (passes.some((pass) => pass.is_active && pass.availability_status !== "hidden" && !allowedVisible.has(norm(pass.name)))) {
  throw new Error("Unexpected visible Paupahan pass; no changes made");
}

for (const [name, robux, price, cost] of desired) {
  const values = {
    name, robux_amount: robux, your_price: price, your_cost: cost,
    is_active: true, availability_status: "available",
  };
  const old = passes.find((pass) => norm(pass.name) === norm(name));
  if (!old) {
    const { data, error } = await supabase.from("gamepasses")
      .insert({ ...values, game_id: gameId, user_id: game.user_id }).select("id").single();
    if (error) throw error;
    console.log(`Paupahan: added ${name} (${data.id})`);
  } else if (
    old.name !== name || old.robux_amount !== robux || Number(old.your_price) !== price ||
    Number(old.your_cost) !== cost || !old.is_active || old.availability_status !== "available"
  ) {
    const { data, error } = await supabase.from("gamepasses")
      .update(values).eq("id", old.id).eq("game_id", gameId).select("id").single();
    if (error) throw error;
    console.log(`Paupahan: updated ${name} (${data.id})`);
  }
}
for (const old of passes) {
  if (desiredNames.has(norm(old.name)) || (!old.is_active && old.availability_status === "hidden")) continue;
  const { data, error } = await supabase.from("gamepasses")
    .update({ is_active: false, availability_status: "hidden" })
    .eq("id", old.id).eq("game_id", gameId).select("id").single();
  if (error) throw error;
  console.log(`Paupahan: hid ${old.name} (${data.id})`);
}

const { data: raw, count: rawCount, error: rawError } = await supabase.from("gamepasses")
  .select(fields, { count: "exact" }).eq("game_id", gameId);
if (rawError) throw rawError;
if (raw.length !== rawCount) throw new Error("Incomplete Paupahan verification");
const { data: listed, error: viewError } = await supabase.from("store_gamepasses")
  .select("id,name,robux_amount,price,availability_status").eq("game_id", gameId);
if (viewError) throw viewError;
if (listed.length !== desired.length) throw new Error(`Wrong public Paupahan count: ${listed.length}`);
for (const [name, robux, price, cost] of desired) {
  const row = raw.find((pass) => norm(pass.name) === norm(name));
  const visible = listed.find((pass) => pass.id === row?.id);
  if (!row || !row.is_active || row.availability_status !== "available" ||
    row.robux_amount !== robux || Number(row.your_price) !== price || Number(row.your_cost) !== cost ||
    !visible || visible.robux_amount !== robux || Number(visible.price) !== price ||
    visible.availability_status !== "available") {
    throw new Error(`Paupahan verification failed for ${name}`);
  }
}
console.log(`Paupahan: verified ${listed.length} public passes`);
