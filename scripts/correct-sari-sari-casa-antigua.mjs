import { createClient } from "@supabase/supabase-js";

const gameId = "ebf8bb61-85d1-4f48-9ed4-01259f28aaa0";
const passId = "e004387e-4f82-4b6f-8b8a-2c090d884de8";
const old = { name: "Casa Ilustrado", robux_amount: 199, your_price: 85, your_cost: 65.67 };
const desired = { name: "Casa Antigua", robux_amount: 349, your_price: 139, your_cost: 115.17 };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anonKey) throw new Error("Catalog credentials are missing");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const norm = (value) => value.trim().toLowerCase();
const hasValues = (pass, expected) => pass.name === expected.name &&
  pass.robux_amount === expected.robux_amount &&
  Number(pass.your_price) === expected.your_price &&
  Number(pass.your_cost) === expected.your_cost;

const { data: game, error: gameError } = await admin.from("games")
  .select("id,name").eq("id", gameId).single();
if (gameError) throw gameError;
if (norm(game.name) !== "run a sari sari store") throw new Error("Wrong target game");

const { data: passes, count, error: passesError } = await admin.from("gamepasses")
  .select("id,game_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
  .eq("game_id", gameId);
if (passesError) throw passesError;
if (passes.length !== count) throw new Error("Could not inspect every gamepass");
const pass = passes.find((row) => row.id === passId);
if (!pass || !pass.is_active || pass.availability_status !== "available" ||
  !(hasValues(pass, old) || hasValues(pass, desired))) {
  throw new Error("Casa Ilustrado has unexpected values or availability; no change made");
}
if (passes.some((row) => row.id !== passId &&
  (norm(row.name) === norm(old.name) || norm(row.name) === norm(desired.name)))) {
  throw new Error("Another Casa Ilustrado or Casa Antigua record exists; no change made");
}

const { data: override, error: overrideError } = await admin.from("store_product_display_names")
  .select("gamepass_id,game_id,display_name").eq("gamepass_id", passId).maybeSingle();
if (overrideError) throw overrideError;
if (override && (override.game_id !== gameId ||
  ![old.name, desired.name].includes(override.display_name))) {
  throw new Error("Unexpected display name override; no change made");
}
const { data: publicPasses, error: publicError } = await publicClient.from("store_gamepasses")
  .select("id,name,display_name").eq("game_id", gameId);
if (publicError) throw publicError;
if (publicPasses.some((row) => row.id !== passId &&
  norm(row.display_name || row.name) === norm(desired.name))) {
  throw new Error("Another public Casa Antigua listing exists; no change made");
}

if (!hasValues(pass, desired)) {
  const { data: updated, error } = await admin.from("gamepasses")
    .update(desired).eq("id", passId).eq("game_id", gameId)
    .eq("name", old.name).eq("robux_amount", old.robux_amount)
    .eq("your_price", old.your_price).eq("your_cost", old.your_cost)
    .eq("is_active", true).eq("availability_status", "available")
    .select("id").single();
  if (error) throw error;
  if (updated.id !== passId) throw new Error("Updated the wrong gamepass");
  console.log("Corrected the existing Casa Ilustrado gamepass");
}
if (override?.display_name === old.name) {
  const { data: updated, error } = await admin.from("store_product_display_names")
    .update({ display_name: desired.name })
    .eq("gamepass_id", passId).eq("game_id", gameId).eq("display_name", old.name)
    .select("gamepass_id").single();
  if (error) throw error;
  if (updated.gamepass_id !== passId) throw new Error("Updated the wrong display name");
  console.log("Corrected the display name override");
}

const { data: finalRaw, error: finalError } = await admin.from("gamepasses")
  .select("id,name,robux_amount,your_price,your_cost,is_active,availability_status")
  .eq("id", passId).single();
if (finalError) throw finalError;
if (!hasValues(finalRaw, desired) || !finalRaw.is_active || finalRaw.availability_status !== "available") {
  throw new Error("The gamepass did not retain the requested values");
}
const { data: visible, error: viewError } = await publicClient.from("store_gamepasses")
  .select("id,game_id,name,display_name,robux_amount,price,availability_status")
  .eq("id", passId).single();
if (viewError) throw viewError;
if (visible.game_id !== gameId || visible.name !== desired.name ||
  (visible.display_name && visible.display_name !== desired.name) ||
  visible.robux_amount !== desired.robux_amount || Number(visible.price) !== desired.your_price ||
  visible.availability_status !== "available") {
  throw new Error("Casa Antigua does not match the public catalog");
}
const response = await fetch(`https://budgetwiseshop.com/api/catalog/items?ids=${passId}`);
if (!response.ok) throw new Error(`Checkout catalog returned ${response.status}`);
const body = await response.json();
const item = body.items?.[0];
if (body.items?.length !== 1 || item.gamepassId !== passId || !item.listed || !item.available ||
  item.name !== desired.name || Number(item.price) !== desired.your_price ||
  Number(item.robuxAmount) !== desired.robux_amount) {
  throw new Error("Casa Antigua did not appear correctly in the checkout catalog");
}
console.log("Verified Casa Antigua on the original product ID: 349 Robux, PHP 139, cost PHP 115.17");
