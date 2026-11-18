import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const original = JSON.parse(readFileSync("scripts/data/catalog-reprice-2026-11-18.json", "utf8"));
const followup = JSON.parse(readFileSync("scripts/data/catalog-reprice-followup-2026-11-18.json", "utf8"));
const norm = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const aliases = new Map([
  ["keyboard escape candy chocolate dc acc", "keyboard escape candy chocolate"],
  ["bloxfruit", "blox fruits"],
  ["blox burg", "bloxburg"],
]);
const sections = new Map();
const sheetConflicts = [];
for (const section of original) {
  if (norm(section.game) === "robux sell") continue;
  const key = norm(section.game);
  if (sections.has(key) && JSON.stringify(sections.get(key).rows) !== JSON.stringify(section.rows)) {
    sheetConflicts.push(section.game);
  }
  if (!sections.has(key)) sections.set(key, section);
}
for (const section of followup) sections.set(norm(section.game), section);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key || !anon) throw new Error("Catalog credentials are missing");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

async function allRows(client, table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, count, error } = await client.from(table)
      .select(columns, { count: "exact" }).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (rows.length === count) return rows;
    if (rows.length > count || data.length === 0) throw new Error(`Incomplete ${table} inventory`);
  }
}

const [rawGames, rawPasses, games, passes] = await Promise.all([
  allRows(admin, "games", "id,name,availability_status"),
  allRows(admin, "gamepasses", "id,game_id,name,robux_amount,your_price,your_cost,is_active,availability_status"),
  allRows(publicClient, "store_games", "id,name,slug,availability_status"),
  allRows(publicClient, "store_gamepasses", "id,game_id,name,display_name,robux_amount,price,availability_status"),
]);
const rawById = new Map(rawPasses.map((pass) => [pass.id, pass]));
const publicGameById = new Map(games.map((game) => [game.id, game]));
const report = {
  generatedAt: new Date().toISOString(),
  totals: { rawGames: rawGames.length, publicGames: games.length, rawPasses: rawPasses.length,
    publicPasses: passes.length, sheetGames: sections.size },
  sheetConflicts,
  duplicateGameSlugs: [], duplicatePublicPasses: [], duplicateRawPasses: [],
  missingGames: [], missingPasses: [], unavailable: [], robuxMismatch: [],
  priceMismatch: [], costMismatch: [], extras: [], checkoutApiMismatch: [],
  checkedPrices: 0,
};
function duplicates(rows, makeKey, destination) {
  const byKey = new Map();
  for (const row of rows) {
    const key = makeKey(row);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  for (const [key, group] of byKey) if (group.length > 1) destination.push({ key, ids: group.map((row) => row.id), names: group.map((row) => row.name) });
}
duplicates(games, (game) => game.slug, report.duplicateGameSlugs);
duplicates(passes, (pass) => `${pass.game_id}|${norm(pass.display_name || pass.name)}`, report.duplicatePublicPasses);
duplicates(rawPasses, (pass) => `${pass.game_id}|${norm(pass.name)}`, report.duplicateRawPasses);

const coveredGameIds = new Set();
for (const section of sections.values()) {
  const target = aliases.get(norm(section.game)) ?? norm(section.game);
  const matchingGames = games.filter((game) => norm(game.name) === target);
  if (matchingGames.length !== 1) {
    report.missingGames.push({ sheetGame: section.game, matches: matchingGames.map((game) => game.id) });
    continue;
  }
  const game = matchingGames[0];
  coveredGameIds.add(game.id);
  const listed = passes.filter((pass) => pass.game_id === game.id);
  const expectedKeys = new Set(section.rows.map((row) => `${norm(row.name)}|${row.robux}`));
  for (const row of section.rows) {
    const item = { game: game.name, pass: row.name, robux: row.robux, expectedPrice: row.price, expectedCost: row.cost };
    const sameName = listed.filter((pass) => norm(pass.display_name || pass.name) === norm(row.name));
    const exact = sameName.filter((pass) => pass.robux_amount === row.robux);
    if (exact.length !== 1) {
      const rawName = rawPasses.filter((pass) => pass.game_id === game.id && norm(pass.name) === norm(row.name));
      if (sameName.length || rawName.length) {
        report.robuxMismatch.push({ ...item, publicRobux: sameName.map((pass) => pass.robux_amount), rawRobux: rawName.map((pass) => pass.robux_amount) });
      } else report.missingPasses.push(item);
      continue;
    }
    const pass = exact[0];
    const source = rawById.get(pass.id);
    if (!source || !source.is_active || pass.availability_status !== "available" ||
      source.availability_status !== "available" || game.availability_status !== "available") {
      report.unavailable.push({ ...item, id: pass.id, status: pass.availability_status });
      continue;
    }
    report.checkedPrices++;
    if (Number(pass.price) !== row.price || Number(source.your_price) !== row.price) {
      report.priceMismatch.push({ ...item, id: pass.id, publicPrice: Number(pass.price), rawPrice: Number(source.your_price) });
    }
    if (Number(source.your_cost) !== row.cost) {
      report.costMismatch.push({ ...item, id: pass.id, rawCost: Number(source.your_cost) });
    }
  }
  for (const pass of listed) {
    if (!expectedKeys.has(`${norm(pass.display_name || pass.name)}|${pass.robux_amount}`)) {
      report.extras.push({ game: game.name, pass: pass.display_name || pass.name, robux: pass.robux_amount,
        id: pass.id, price: Number(pass.price), status: pass.availability_status });
    }
  }
}

// Check the actual checkout-facing endpoint for every public product.
for (let offset = 0; offset < passes.length; offset += 20) {
  const batch = passes.slice(offset, offset + 20);
  const request = new URL("https://budgetwiseshop.com/api/catalog/items");
  request.searchParams.set("ids", batch.map((pass) => pass.id).join(","));
  const response = await fetch(request, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Checkout catalog API returned ${response.status}`);
  const { items } = await response.json();
  if (!Array.isArray(items) || items.length !== batch.length) throw new Error("Checkout catalog API returned incomplete items");
  for (const pass of batch) {
    const item = items.find((entry) => entry.gamepassId === pass.id);
    const game = publicGameById.get(pass.game_id);
    const expectedAvailable = game?.availability_status === "available" && pass.availability_status === "available";
    if (!item || item.listed !== Boolean(game) || item.available !== expectedAvailable ||
      (game && (item.price !== Number(pass.price) || item.robuxAmount !== pass.robux_amount))) {
      report.checkoutApiMismatch.push({ id: pass.id, game: game?.name ?? null, pass: pass.name,
        expectedPrice: Number(pass.price), checkoutItem: item ?? null });
    }
  }
}

writeFileSync("catalog-public-price-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ totals: report.totals, checkedPrices: report.checkedPrices,
  duplicateGameSlugs: report.duplicateGameSlugs.length,
  duplicatePublicPasses: report.duplicatePublicPasses.length,
  duplicateRawPasses: report.duplicateRawPasses.length,
  missingGames: report.missingGames.length, missingPasses: report.missingPasses.length,
  unavailable: report.unavailable.length, robuxMismatch: report.robuxMismatch.length,
  priceMismatch: report.priceMismatch.length, costMismatch: report.costMismatch.length,
  extras: report.extras.length, checkoutApiMismatch: report.checkoutApiMismatch.length }));
