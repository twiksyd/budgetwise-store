import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// These are existing public passes whose shop names differ from the sheet.
// Match exact IDs, Roblox amounts, and prior prices before changing either
// the selling price or cost. No products are added or hidden.
const plan = JSON.parse(readFileSync("scripts/data/catalog-reprice-alias-fixes.json", "utf8"));
const sheet = JSON.parse(readFileSync("scripts/data/catalog-reprice-2026-11-18.json", "utf8"));
const norm = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const aliases = new Map([
  ["anime expedition|2500 villain coins", "2 500 villain coins"],
  ["anime expedition|7500villain coins", "7 500 villain coins"],
  ["anime expedition|25000villain coins", "25 000 villain coins"],
  ["anime expedition|75000villain coins", "75 000 villain coins"],
  ["ihaw ihaw|hachiware set", "haciware set"],
  ["ihaw ihaw|orchid contour set", "orchid countour set"],
  ["ihaw ihaw|sampaguite suite", "sampaguita suite"],
  ["ihaw ihaw|500", "tier 1 pesos 500"],
  ["ihaw ihaw|2 000", "tier 2 pesos 2000"],
  ["ihaw ihaw|6 000", "tier 3 pesos 6000"],
  ["ihaw ihaw|15 000", "tier 4 pesos 15000"],
  ["ihaw ihaw|40 000", "tier 5 pesos 40000"],
]);
if (plan.length !== 12 || new Set(plan.map((item) => item.id)).size !== 12) throw new Error("Unexpected alias price plan");
for (const item of plan) {
  const section = sheet.find((entry) => norm(entry.game) === norm(item.game));
  const row = section?.rows.find((entry) => norm(entry.name) === norm(item.sheetPass) && entry.robux === item.robux);
  if (!row || row.price !== item.price || row.cost !== item.cost ||
    !aliases.has(`${norm(item.game)}|${norm(item.sheetPass)}`)) {
    throw new Error(`Plan does not match the supplied sheet: ${item.game} / ${item.sheetPass}`);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const ids = plan.map((item) => item.id);
const [rawResult, publicResult] = await Promise.all([
  admin.from("gamepasses").select("id,game_id,name,robux_amount,your_price,your_cost,is_active,availability_status").in("id", ids),
  publicClient.from("store_gamepasses").select("id,game_id,price,availability_status").in("id", ids),
]);
if (rawResult.error) throw rawResult.error;
if (publicResult.error) throw publicResult.error;
if (rawResult.data.length !== 12 || publicResult.data.length !== 12) throw new Error("One of the planned passes is not publicly listed");
const raw = new Map(rawResult.data.map((item) => [item.id, item]));
const listed = new Map(publicResult.data.map((item) => [item.id, item]));
const gameIds = [...new Set(rawResult.data.map((item) => item.game_id))];
const [gameResult, publicGameResult] = await Promise.all([
  admin.from("games").select("id,name,availability_status").in("id", gameIds),
  publicClient.from("store_games").select("id,name,availability_status").in("id", gameIds),
]);
if (gameResult.error) throw gameResult.error;
if (publicGameResult.error) throw publicGameResult.error;
const games = new Map(gameResult.data.map((item) => [item.id, item]));
const publicGames = new Set(publicGameResult.data.filter((item) => item.availability_status === "available").map((item) => item.id));
const pending = [];
for (const item of plan) {
  const pass = raw.get(item.id);
  const visible = listed.get(item.id);
  const game = games.get(pass.game_id);
  if (game?.name !== item.game || game.availability_status !== "available" || !publicGames.has(game.id) ||
    norm(pass.name) !== aliases.get(`${norm(item.game)}|${norm(item.sheetPass)}`) ||
    pass.robux_amount !== item.robux || !pass.is_active || pass.availability_status !== "available" ||
    visible.game_id !== game.id || visible.availability_status !== "available") {
    throw new Error(`Identity or availability changed: ${item.game} / ${item.sheetPass}`);
  }
  const old = Number(pass.your_price) === item.oldPrice && Number(pass.your_cost) === item.oldCost &&
    Number(visible.price) === item.oldPrice;
  const done = Number(pass.your_price) === item.price && Number(pass.your_cost) === item.cost &&
    Number(visible.price) === item.price;
  if (!old && !done) throw new Error(`Price changed since audit: ${item.game} / ${item.sheetPass}`);
  if (!done) pending.push(item);
}
console.log(`Preflight passed: ${pending.length} alias passes need updates`);
for (const item of pending) {
  const { data, error } = await admin.from("gamepasses")
    .update({ your_price: item.price, your_cost: item.cost })
    .eq("id", item.id).eq("robux_amount", item.robux)
    .eq("your_price", item.oldPrice).eq("your_cost", item.oldCost)
    .eq("is_active", true).eq("availability_status", "available")
    .select("id,your_price,your_cost").single();
  if (error) throw error;
  if (Number(data.your_price) !== item.price || Number(data.your_cost) !== item.cost) throw new Error(`Update failed for ${item.id}`);
  console.log(`Updated ${item.game}: ${item.sheetPass}`);
}
const { data: final, error: finalError } = await publicClient.from("store_gamepasses")
  .select("id,price").in("id", ids);
if (finalError) throw finalError;
if (final.length !== 12 || final.some((pass) => Number(pass.price) !== plan.find((item) => item.id === pass.id)?.price)) {
  throw new Error("Final public price verification failed");
}
console.log("Verified all 12 public alias prices");
