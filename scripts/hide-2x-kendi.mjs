import { createClient } from "@supabase/supabase-js";

const productId = "c94f784d-ba20-4684-b07d-dedb1e005ca1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: pass, error: passError } = await admin.from("gamepasses")
  .select("id,game_id,name,robux_amount,your_price,is_active,availability_status")
  .eq("id", productId).single();
if (passError) throw passError;
const { data: game, error: gameError } = await admin.from("games")
  .select("id,name").eq("id", pass.game_id).single();
if (gameError) throw gameError;
if (game.name !== "Run a Sari Sari store" || pass.name !== "2x Kendi" ||
  pass.robux_amount !== 49 || Number(pass.your_price) !== 19) {
  throw new Error("Product identity or price changed; no update made");
}
if (pass.is_active || pass.availability_status !== "hidden") {
  if (!pass.is_active || pass.availability_status !== "available") {
    throw new Error("Unexpected 2x Kendi availability; no update made");
  }
  const { data: updated, error: updateError } = await admin.from("gamepasses")
    .update({ is_active: false, availability_status: "hidden" })
    .eq("id", productId).eq("game_id", game.id).eq("name", "2x Kendi")
    .eq("robux_amount", 49).eq("your_price", 19)
    .eq("is_active", true).eq("availability_status", "available")
    .select("id,is_active,availability_status").single();
  if (updateError) throw updateError;
  if (updated.is_active || updated.availability_status !== "hidden") throw new Error("Hide operation did not persist");
  console.log("Hid 2x Kendi without deleting its record");
}

const { data: raw, error: rawError } = await admin.from("gamepasses")
  .select("id,is_active,availability_status").eq("id", productId).single();
if (rawError) throw rawError;
if (raw.is_active || raw.availability_status !== "hidden") throw new Error("2x Kendi is still active");
const { data: visible, error: viewError } = await publicClient.from("store_gamepasses")
  .select("id").eq("id", productId);
if (viewError) throw viewError;
if (visible.length !== 0) throw new Error("2x Kendi is still in the public catalog");
const response = await fetch(`https://budgetwiseshop.com/api/catalog/items?ids=${productId}`);
if (!response.ok) throw new Error(`Checkout catalog returned ${response.status}`);
const { items } = await response.json();
if (items.length !== 1 || items[0].listed || items[0].available) throw new Error("Checkout still lists 2x Kendi");

for (const expected of [
  { id: "6e14cdd7-7aa3-4229-9e6e-be271770006c", name: "Nimbuslux Set", robux: 659, price: 235 },
  { id: "c8661664-9d44-4d8c-99d2-a8cf7662a546", name: "Magnet", robux: 3500, price: 1259 },
]) {
  const { data, error } = await publicClient.from("store_gamepasses")
    .select("id,name,robux_amount,price").eq("id", expected.id).single();
  if (error) throw error;
  if (data.name !== expected.name || data.robux_amount !== expected.robux || Number(data.price) !== expected.price) {
    throw new Error(`Unrelated product changed: ${expected.name}`);
  }
}
console.log("Verified checkout removal; Nimbuslux Set and Magnet remain unchanged");
