import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// One-time guarded write for the read-only audit captured on 2026-11-18.
// Only existing, listed, available passes are repriced. No games or passes
// are created, hidden, deleted, or given a different Robux amount.
const followup = process.env.REPRICE_FOLLOWUP === "1";
const plan = JSON.parse(readFileSync(followup
  ? "scripts/data/catalog-reprice-followup-plan-2026-11-18.json"
  : "scripts/data/catalog-reprice-plan-2026-11-18.json", "utf8"));
const sheet = JSON.parse(readFileSync(followup
  ? "scripts/data/catalog-reprice-followup-2026-11-18.json"
  : "scripts/data/catalog-reprice-2026-11-18.json", "utf8"));
const norm = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const blockedGames = new Set(followup ? [] : [
  "robux sell", "blox burg", "midnight chasers", "run a restaurant",
  "strongest battlegrounds", "evade", "markado", "anime adventures",
  "ghost driver", "iron soul dungeon",
]);
const expectedCount = followup ? 64 : 239;
if (plan.updates.length !== expectedCount || new Set(plan.updates.map((item) => item.id)).size !== expectedCount) {
  throw new Error("Unexpected repricing plan size or duplicate pass IDs");
}
for (const item of plan.updates) {
  if (blockedGames.has(norm(item.game)) || !Number.isFinite(item.price) || !Number.isFinite(item.cost) ||
    item.price <= 0 || item.cost < 0 || item.price <= item.cost) {
    throw new Error(`Unsafe plan entry: ${item.game} / ${item.pass}`);
  }
  if (!sheet.some((section) => section.rows.some((row) => norm(row.name) === norm(item.pass) &&
    row.robux === item.robux && row.price === item.price && row.cost === item.cost))) {
    throw new Error(`Plan entry not in supplied sheet: ${item.game} / ${item.pass}`);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

async function fetchByIds(client, table, columns, ids) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const { data, error } = await client.from(table).select(columns)
      .in("id", ids.slice(offset, offset + 50));
    if (error) throw error;
    rows.push(...data);
  }
  return rows;
}

const ids = plan.updates.map((item) => item.id);
const [raw, publicPasses] = await Promise.all([
  fetchByIds(admin, "gamepasses", "id,game_id,name,robux_amount,your_price,your_cost,is_active,availability_status", ids),
  fetchByIds(publicClient, "store_gamepasses", "id,game_id,name,robux_amount,price,availability_status", ids),
]);
if (raw.length !== ids.length || publicPasses.length !== ids.length) {
  throw new Error("A planned pass is missing from the public or raw catalog; no writes made");
}
const gameIds = [...new Set(plan.updates.map((item) => item.gameId))];
const [games, publicGames] = await Promise.all([
  fetchByIds(admin, "games", "id,name,availability_status", gameIds),
  fetchByIds(publicClient, "store_games", "id,name,availability_status", gameIds),
]);
if (games.length !== gameIds.length || publicGames.length !== gameIds.length) {
  throw new Error("A planned game is missing from the public or raw catalog; no writes made");
}
if (followup) {
  const { data: markado, error } = await publicClient.from("store_games")
    .select("id,name,slug").eq("slug", "markado");
  if (error) throw error;
  const plannedMarkado = plan.updates.find((item) => item.game === "Markado");
  if (markado.length !== 1 || markado[0].id !== plannedMarkado?.gameId) {
    throw new Error("Markado public page is ambiguous; no writes made");
  }
}
const rawById = new Map(raw.map((item) => [item.id, item]));
const publicById = new Map(publicPasses.map((item) => [item.id, item]));
const gameById = new Map(games.map((item) => [item.id, item]));
const publicGameIds = new Set(publicGames.filter((item) => item.availability_status === "available").map((item) => item.id));
const pending = [];
for (const item of plan.updates) {
  const pass = rawById.get(item.id);
  const visible = publicById.get(item.id);
  const game = gameById.get(item.gameId);
  if (game?.name !== item.game || game.availability_status !== "available" || !publicGameIds.has(item.gameId) ||
    pass.game_id !== item.gameId || norm(pass.name) !== norm(item.pass) || pass.robux_amount !== item.robux ||
    !pass.is_active || pass.availability_status !== "available" || visible.game_id !== item.gameId ||
    visible.robux_amount !== item.robux || visible.availability_status !== "available") {
    throw new Error(`Catalog identity or availability changed for ${item.game} / ${item.pass}; no writes made`);
  }
  const old = Number(pass.your_price) === item.oldPrice && Number(pass.your_cost) === item.oldCost &&
    Number(visible.price) === item.oldPrice;
  const done = Number(pass.your_price) === item.price && Number(pass.your_cost) === item.cost &&
    Number(visible.price) === item.price;
  if (!old && !done) throw new Error(`Price changed since audit for ${item.game} / ${item.pass}; no writes made`);
  if (!done) pending.push(item);
}
console.log(`Preflight passed: ${pending.length} pending, ${ids.length - pending.length} already updated`);

for (let index = 0; index < pending.length; index++) {
  const item = pending[index];
  const { data, error } = await admin.from("gamepasses")
    .update({ your_price: item.price, your_cost: item.cost })
    .eq("id", item.id).eq("game_id", item.gameId)
    .eq("robux_amount", item.robux).eq("is_active", true)
    .eq("availability_status", "available")
    .eq("your_price", item.oldPrice).eq("your_cost", item.oldCost)
    .select("id,your_price,your_cost").single();
  if (error) throw new Error(`Update failed at ${index + 1}/${pending.length}: ${item.game} / ${item.pass}: ${error.message}`);
  if (Number(data.your_price) !== item.price || Number(data.your_cost) !== item.cost) {
    throw new Error(`Update returned unexpected values for ${item.game} / ${item.pass}`);
  }
  if ((index + 1) % 25 === 0 || index + 1 === pending.length) console.log(`Updated ${index + 1}/${pending.length}`);
}

const [finalRaw, finalPublic] = await Promise.all([
  fetchByIds(admin, "gamepasses", "id,your_price,your_cost", ids),
  fetchByIds(publicClient, "store_gamepasses", "id,price", ids),
]);
const finalRawById = new Map(finalRaw.map((item) => [item.id, item]));
const finalPublicById = new Map(finalPublic.map((item) => [item.id, item]));
for (const item of plan.updates) {
  const pass = finalRawById.get(item.id);
  const visible = finalPublicById.get(item.id);
  if (Number(pass?.your_price) !== item.price || Number(pass?.your_cost) !== item.cost ||
    Number(visible?.price) !== item.price) {
    throw new Error(`Final verification failed for ${item.game} / ${item.pass}`);
  }
}
console.log(`Verified ${plan.updates.length} repriced public passes`);
