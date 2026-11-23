import { createClient } from "@supabase/supabase-js";

const gameId = "ebf8bb61-85d1-4f48-9ed4-01259f28aaa0";
const product = {
  name: "Toymaker Bundle",
  robux_amount: 549,
  your_price: 215,
  your_cost: 181.17,
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
if (game.name.trim().toLowerCase() !== "run a sari sari store") throw new Error("Wrong target game");

const { data: passes, count, error: passesError } = await admin.from("gamepasses")
  .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
  .eq("game_id", gameId);
if (passesError) throw passesError;
if (passes.length !== count) throw new Error("Could not inspect every Run a Sari Sari store gamepass");
const owners = [...new Set(passes.map((pass) => pass.user_id))];
if (owners.length !== 1 || !owners[0]) throw new Error("Expected one Run a Sari Sari store catalog owner");

const matches = passes.filter((pass) => pass.name.trim().toLowerCase() === product.name.toLowerCase());
if (matches.length > 1) throw new Error("Duplicate Toymaker Bundle records; no change made");
let passId;
if (matches.length === 1) {
  const old = matches[0];
  passId = old.id;
  if (old.name !== product.name || old.robux_amount !== product.robux_amount ||
    Number(old.your_price) !== product.your_price || Number(old.your_cost) !== product.your_cost ||
    !old.is_active || old.availability_status !== "available") {
    const { data: updated, error } = await admin.from("gamepasses")
      .update(product).eq("id", passId).eq("game_id", gameId).select("id").single();
    if (error) throw error;
    if (updated.id !== passId) throw new Error("Updated the wrong gamepass");
    console.log(`Restored existing Toymaker Bundle record: ${passId}`);
  } else {
    console.log(`Already present with requested values: ${passId}`);
  }
} else {
  const { data: created, error } = await admin.from("gamepasses")
    .insert({ ...product, game_id: gameId, user_id: owners[0] }).select("id").single();
  if (error) throw error;
  passId = created.id;
  console.log(`Added Toymaker Bundle: ${passId}`);
}

const { data: visible, error: viewError } = await publicClient.from("store_gamepasses")
  .select("id,game_id,name,robux_amount,price,availability_status")
  .eq("id", passId).single();
if (viewError) throw viewError;
if (visible.game_id !== gameId || visible.name !== product.name ||
  visible.robux_amount !== product.robux_amount || Number(visible.price) !== product.your_price ||
  visible.availability_status !== "available") {
  throw new Error("Toymaker Bundle does not match the public catalog");
}

const response = await fetch(`https://budgetwiseshop.com/api/catalog/items?ids=${passId}`);
if (!response.ok) throw new Error(`Checkout catalog returned ${response.status}`);
const body = await response.json();
const item = body.items?.[0];
if (body.items?.length !== 1 || item.gamepassId !== passId || !item.listed || !item.available ||
  item.name !== product.name || Number(item.price) !== product.your_price ||
  Number(item.robuxAmount) !== product.robux_amount) {
  throw new Error("Toymaker Bundle did not appear correctly in the checkout catalog");
}
console.log("Verified public listing and checkout: 549 Robux, PHP 215, cost PHP 181.17");
