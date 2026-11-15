import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseUrl = process.env.CF_STAGING_URL?.replace(/\/$/, "");
const adminEmail = process.env.STAGING_ADMIN_EMAIL;
const adminPassword = process.env.STAGING_ADMIN_PASSWORD;
const smokeOrderNumber = process.env.STAGING_SMOKE_ORDER_NUMBER;

for (const [name, value] of Object.entries({
  baseUrl,
  adminEmail,
  adminPassword,
  smokeOrderNumber,
})) {
  if (!value)
    throw new Error(
      `${name} is required for the read-only staging smoke check`,
    );
}

async function expectStatus(path, expected = 200, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  assert.equal(
    response.status,
    expected,
    `${path} returned ${response.status}`,
  );
  return response;
}

const home = await expectStatus("/");
const homeHtml = await home.text();
assert.match(
  homeHtml,
  /BudgetWise/i,
  "home page should render the store brand",
);

const games = await expectStatus("/games");
const gamesHtml = await games.text();
await expectStatus("/games/robux-via-link");
await expectStatus("/checkout");

const gameSlugs = [...gamesHtml.matchAll(/href=["']\/games\/([^"'/?#]+)["']/gi)]
  .map((match) => decodeURIComponent(match[1]))
  .filter((slug) => slug !== "robux-via-link");
assert.ok(
  gameSlugs.length > 0,
  "game listing should link to at least one live game page",
);
const game = await expectStatus(`/games/${encodeURIComponent(gameSlugs[0])}`);
assert.ok(
  (await game.text()).length > 500,
  "game page should contain rendered catalog content",
);

const reviews = await expectStatus("/api/reviews");
assert.ok(
  Array.isArray(await reviews.json()),
  "reviews API should return a JSON list",
);

const malformedOrder = await expectStatus("/api/orders", 400, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{",
});
assert.equal((await malformedOrder.json()).code, "MALFORMED_JSON");

for (const path of [
  "/api/account/conversations",
  "/api/account/orders",
  "/api/admin/inbox",
]) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.ok(
    [401, 403].includes(response.status),
    `${path} should reject an unauthenticated request`,
  );
}

const imageSources = [
  ...homeHtml.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi),
]
  .slice(0, 12)
  .map((match) => match[1].replaceAll("&amp;", "&"));
assert.ok(imageSources.length > 0, "home page should render image elements");
assert.ok(
  imageSources.some((src) => !src.startsWith("/_next/image")),
  "Cloudflare build should serve source images directly on workers.dev",
);

let imageLoaded = false;
for (const src of imageSources) {
  try {
    const response = await fetch(new URL(src, baseUrl), {
      signal: AbortSignal.timeout(12_000),
    });
    if (
      response.ok &&
      response.headers.get("content-type")?.startsWith("image/")
    ) {
      imageLoaded = true;
      break;
    }
  } catch {
    // Try another rendered source; one image host may be temporarily unavailable.
  }
}
assert.ok(imageLoaded, "at least one rendered storefront image should load");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page
    .getByRole("heading", { name: "Order Chats" })
    .waitFor({ timeout: 45_000 });
  await page.locator('[data-connection="live"]').waitFor({ timeout: 45_000 });

  const inbox = await page.request.get(
    `${baseUrl}/api/admin/inbox?filter=active`,
  );
  assert.equal(
    inbox.status(),
    200,
    "authenticated admin inbox API should load",
  );

  await page.goto(
    `${baseUrl}/admin/orders/${encodeURIComponent(smokeOrderNumber)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page
    .locator('textarea[aria-label="Message"]')
    .waitFor({ timeout: 45_000 });
  const history = await page.request.get(
    `${baseUrl}/api/order-chat/${encodeURIComponent(smokeOrderNumber)}/messages?as=admin`,
  );
  assert.equal(
    history.status(),
    200,
    "authenticated admin chat history should load",
  );
  assert.deepEqual(
    pageErrors,
    [],
    "admin inbox/chat should not raise browser runtime errors",
  );
  console.log(
    "Staging smoke check passed: storefront, game detail, checkout validation, APIs, images, admin inbox/chat, auth, and Realtime.",
  );
} finally {
  await browser.close();
}
