import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "scripts/data/catalog-reprice-plan-2026-11-18.json",
  "scripts/data/catalog-reprice-followup-plan-2026-11-18.json",
  "scripts/data/catalog-reprice-alias-fixes.json",
];
const rows = files.flatMap((file) => {
  const data = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(data) ? data : data.updates;
});
if (rows.length !== 315 || new Set(rows.map((row) => row.id)).size !== 315) {
  throw new Error("Expected 315 distinct repriced products");
}
const slug = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
const games = [...new Set(rows.map((row) => row.game))];
const results = [];

for (const game of games) {
  const response = await fetch(`https://budgetwiseshop.com/games/${slug(game)}`, {
    headers: { Accept: "text/html" },
  });
  const html = await response.text();
  const missing = [];
  const wrong = [];
  for (const row of rows.filter((item) => item.game === game)) {
    const marker = `\\"id\\":\\"${row.id}\\"`;
    const index = html.indexOf(marker);
    if (index < 0) {
      // React can split a streamed script in the middle of an ID. In that
      // case, use the contiguous product name, Robux amount, and price.
      const fallback = `\\"name\\":\\"${row.pass ?? row.sheetPass}\\",\\"robux_amount\\":${row.robux},\\"price\\":${row.price}`;
      if (!html.includes(fallback)) missing.push({ id: row.id, pass: row.pass ?? row.sheetPass });
      continue;
    }
    const excerpt = html.slice(index, index + 500);
    const found = excerpt.match(/\\"price\\":([0-9.]+)/);
    if (!found || Number(found[1]) !== row.price) {
      wrong.push({ id: row.id, pass: row.pass ?? row.sheetPass, expected: row.price,
        rendered: found ? Number(found[1]) : null });
    }
  }
  results.push({ game, url: response.url, status: response.status,
    productCount: rows.filter((item) => item.game === game).length,
    missing, wrong, hasHeading: html.includes(`aria-label="${game}"`) });
  console.log(`${game}: ${response.status}, ${missing.length} missing, ${wrong.length} wrong`);
}
writeFileSync("rendered-catalog-price-audit.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify({ games: games.length, products: rows.length,
  missing: results.reduce((total, result) => total + result.missing.length, 0),
  wrong: results.reduce((total, result) => total + result.wrong.length, 0) }));
if (results.some((result) => result.status !== 200 || result.missing.length || result.wrong.length)) {
  throw new Error("A rendered game page has a missing or incorrect product price");
}
