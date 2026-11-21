import { createClient } from "@supabase/supabase-js";

const gameId = "d2170ae6-1142-4106-99f1-3026ef057a8a";
const product = {
  game_id: gameId,
  name: "Santa's Sleigh",
  robux_amount: 599,
  your_price: 235,
  your_cost: 197.67,
  is_active: true,
  availability_status: "available",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) throw new Error("Catalog credentials are missing");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: game, error: gameError } = await admin.from("games")
  .select("id,name").eq("id", gameId).single();
if (gameError) throw gameError;
if (game.name.trim().toLowerCase() !== "pa deliber") throw new Error("Wrong target game");

const { data: passes, count, error: passesError } = await admin.from("gamepasses")
  .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
  .eq("game_id", gameId);
if (passesError) throw passesError;
if (count !== passes.length) throw new Error("Could not inspect every existing Pa Deliber gamepass");

const owners = [...new Set(passes.map((pass) => pass.user_id))];
if (owners.length !== 1 || !owners[0]) throw new Error("Expected one existing Pa Deliber catalog owner");

const matches = passes.filter((pass) => pass.name.trim().toLowerCase() === product.name.toLowerCase());
if (matches.length > 1) throw new Error("Santa's Sleigh already has duplicate rows; no change made");
let passId;
if (matches.length === 1) {
  const pass = matches[0];
  if (pass.robux_amount !== product.robux_amount ||
    Number(pass.your_price) !== product.your_price ||
    Number(pass.your_cost) !== product.your_cost ||
    !pass.is_active || pass.availability_status !== "available") {
    throw new Error("Santa's Sleigh already exists with different values; no change made");
  }
  passId = pass.id;
  console.log(`Already present with requested values: ${passId}`);
} else {
  const { data: created, error: insertError } = await admin.from("gamepasses")
    .insert({ ...product, user_id: owners[0] }).select("id").single();
  if (insertError) throw insertError;
  passId = created.id;
  console.log(`Added Santa's Sleigh: ${passId}`);
}

const { data: visible, error: viewError } = await publicClient.from("store_gamepasses")
  .select("id,game_id,name,robux_amount,price,availability_status")
  .eq("id", passId).single();
if (viewError) throw viewError;
if (visible.game_id !== gameId || visible.name !== product.name ||
  visible.robux_amount !== product.robux_amount ||
  Number(visible.price) !== product.your_price ||
  visible.availability_status !== "available") {
  throw new Error("Santa's Sleigh does not match the public catalog");
}

const response = await fetch(`https://budgetwiseshop.com/api/catalog/items?ids=${passId}`);
if (!response.ok) throw new Error(`Checkout catalog returned ${response.status}`);
const body = await response.json();
const item = body.items?.[0];
if (body.items?.length !== 1 || item.gamepassId !== passId ||
  !item.listed || !item.available || item.name !== product.name ||
  Number(item.price) !== product.your_price ||
  Number(item.robuxAmount) !== product.robux_amount) {
  throw new Error("Santa's Sleigh did not appear correctly in the checkout catalog");
}
console.log("Verified public listing and checkout: 599 Robux, PHP 235, cost PHP 197.67");
