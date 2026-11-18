import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const sections = JSON.parse(readFileSync("scripts/data/catalog-reprice-2026-11-18.json", "utf8"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const norm = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const gameAliases = new Map([
  ["keyboard escape candy chocolate dc acc", "keyboard escape candy chocolate"],
  ["bloxfruit", "blox fruits"],
]);
const skipEntirely = new Set(["robux sell", "blox burg", "midnight chasers", "run a restaurant", "strongest battlegrounds", "evade", "markado"]);

async function allRows(client, table, columns) {
  const rows = [];
  let total;
  for (let offset = 0; ; offset += 500) {
    const { data, count, error } = await client.from(table)
      .select(columns, { count: "exact" }).order("id").range(offset, offset + 499);
    if (error) throw error;
    total = count;
    rows.push(...data);
    if (rows.length >= count) break;
    if (data.length === 0) throw new Error(`Incomplete ${table} inventory`);
  }
  if (rows.length !== total) throw new Error(`Incomplete ${table} inventory`);
  return rows;
}

const [games, passes, listedGames, listedPasses] = await Promise.all([
  allRows(admin, "games", "id,name,availability_status"),
  allRows(admin, "gamepasses", "id,game_id,name,robux_amount,your_price,your_cost,is_active,availability_status"),
  allRows(publicClient, "store_games", "id,name,slug,availability_status"),
  allRows(publicClient, "store_gamepasses", "id,game_id,name,robux_amount,price,availability_status"),
]);
const listedGameIds = new Set(listedGames.map((game) => game.id));
const listedPassIds = new Set(listedPasses.map((pass) => pass.id));
const frequency = new Map();
for (const section of sections) frequency.set(norm(section.game), (frequency.get(norm(section.game)) ?? 0) + 1);
const plan = { generatedAt: new Date().toISOString(), updates: [], skipped: [] };
function skip(section, row, reason) {
  plan.skipped.push({ game: section.game, pass: row?.name ?? null, robux: row?.robux ?? null, reason });
}

for (const section of sections) {
  const source = norm(section.game);
  if (source === "robux sell") { skip(section, null, "robux_sell_excluded"); continue; }
  if (frequency.get(source) > 1) { skip(section, null, "duplicate_sheet_game"); continue; }
  if (section.note.toLowerCase().includes("not changed")) { skip(section, null, "marked_not_changed"); continue; }
  if (skipEntirely.has(source)) { skip(section, null, source === "markado" ? "duplicate_catalog_game" : "excluded_or_ambiguous_game"); continue; }
  const target = gameAliases.get(source) ?? source;
  const matches = games.filter((game) => norm(game.name) === target);
  if (matches.length === 0) { skip(section, null, "game_missing_from_shop"); continue; }
  if (matches.length > 1) { skip(section, null, "duplicate_catalog_game"); continue; }
  const game = matches[0];
  if (game.availability_status !== "available" || !listedGameIds.has(game.id)) {
    skip(section, null, "game_unavailable_in_shop"); continue;
  }
  const gamePasses = passes.filter((pass) => pass.game_id === game.id);
  const rowFrequency = new Map();
  for (const row of section.rows) {
    const key = `${norm(row.name)}|${row.robux}`;
    rowFrequency.set(key, (rowFrequency.get(key) ?? 0) + 1);
  }
  for (const row of section.rows) {
    const keyName = norm(row.name);
    if (rowFrequency.get(`${keyName}|${row.robux}`) > 1) { skip(section, row, "duplicate_sheet_pass"); continue; }
    const nameMatches = gamePasses.filter((pass) => norm(pass.name) === keyName);
    const exact = nameMatches.filter((pass) => pass.robux_amount === row.robux);
    if (exact.length !== 1) {
      skip(section, row, exact.length > 1 ? "duplicate_catalog_pass" : nameMatches.length ? "robux_mismatch" : "pass_not_in_shop");
      continue;
    }
    const pass = exact[0];
    if (!pass.is_active || pass.availability_status !== "available" || !listedPassIds.has(pass.id)) {
      skip(section, row, "pass_unavailable_in_shop"); continue;
    }
    if (Number(pass.your_price) === row.price && Number(pass.your_cost) === row.cost) continue;
    plan.updates.push({ game: game.name, gameId: game.id, pass: pass.name, id: pass.id,
      robux: row.robux, oldPrice: Number(pass.your_price), oldCost: Number(pass.your_cost),
      price: row.price, cost: row.cost });
  }
}
writeFileSync("catalog-reprice-audit.json", JSON.stringify(plan, null, 2));
const skipCounts = Object.fromEntries([...new Set(plan.skipped.map((item) => item.reason))]
  .map((reason) => [reason, plan.skipped.filter((item) => item.reason === reason).length]));
console.log(JSON.stringify({ games: games.length, passes: passes.length, sheetSections: sections.length,
  updates: plan.updates.length, skipped: skipCounts }));
