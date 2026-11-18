import { createClient } from "@supabase/supabase-js";

// The shop owner confirmed both products are gone from the Roblox game.
// Keep their rows for historical order references; remove them from sale.
const gameId = "84372024-ee1c-43a0-bbfb-6227c43039d3";
const products = [
  { id: "6e14cdd7-7aa3-4229-9e6e-be271770006c", name: "Nimbuslux Set", robux: 659, price: 235 },
  { id: "ece481aa-f275-490a-8b3e-63b041a06c2c", name: "Lightning Pass", robux: 799, price: 305 },
];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: game, error: gameError } = await admin.from("games")
  .select("id,name").eq("id", gameId).single();
if (gameError) throw gameError;
if (game.name !== "Karinderya") throw new Error("Wrong target game");
const ids = products.map((product) => product.id);
const { data: current, error: readError } = await admin.from("gamepasses")
  .select("id,game_id,name,robux_amount,your_price,is_active,availability_status")
  .in("id", ids);
if (readError) throw readError;
if (current.length !== products.length) throw new Error("A target product is missing; no changes made");
for (const expected of products) {
  const pass = current.find((item) => item.id === expected.id);
  if (pass.game_id !== gameId || pass.name !== expected.name ||
    pass.robux_amount !== expected.robux || Number(pass.your_price) !== expected.price ||
    !(pass.is_active && pass.availability_status === "available") &&
      !(!pass.is_active && pass.availability_status === "hidden")) {
    throw new Error(`Unexpected state for ${expected.name}; no changes made`);
  }
}

for (const expected of products) {
  const pass = current.find((item) => item.id === expected.id);
  if (!pass.is_active) continue;
  const { data: updated, error } = await admin.from("gamepasses")
    .update({ is_active: false, availability_status: "hidden" })
    .eq("id", expected.id).eq("game_id", gameId)
    .eq("name", expected.name).eq("robux_amount", expected.robux)
    .eq("your_price", expected.price).eq("is_active", true)
    .eq("availability_status", "available")
    .select("id,is_active,availability_status").single();
  if (error) throw error;
  if (updated.is_active || updated.availability_status !== "hidden") throw new Error(`Hide failed for ${expected.name}`);
  console.log(`Hid ${expected.name}`);
}

const { data: finalRaw, error: finalError } = await admin.from("gamepasses")
  .select("id,is_active,availability_status").in("id", ids);
if (finalError) throw finalError;
if (finalRaw.length !== 2 || finalRaw.some((pass) => pass.is_active || pass.availability_status !== "hidden")) {
  throw new Error("A product remains active");
}
const { data: publicPasses, error: viewError } = await publicClient.from("store_gamepasses")
  .select("id").in("id", ids);
if (viewError) throw viewError;
if (publicPasses.length) throw new Error("A removed product still appears in the public catalog");
const response = await fetch(`https://budgetwiseshop.com/api/catalog/items?ids=${ids.join(",")}`);
if (!response.ok) throw new Error(`Checkout catalog returned ${response.status}`);
const { items } = await response.json();
if (items.length !== 2 || items.some((item) => item.listed || item.available)) {
  throw new Error("Checkout still offers a removed Karinderya product");
}
console.log("Verified both products are hidden and unavailable at checkout");
