// Seeds a LOCAL Supabase stack (supabase start) for the end-to-end inbox
// test. Refuses to run against anything that is not localhost.
import { createClient } from "@supabase/supabase-js";

const url = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error(`Refusing to seed a non-local Supabase URL: ${url}`);
}
if (!serviceKey) throw new Error("E2E_SUPABASE_SERVICE_ROLE_KEY is required");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
export const PASSWORD = "e2e-password-123";
export const USERS = {
  robert: { email: "robert@bw.local", name: "Robert", admin: true },
  andre: { email: "andre@bw.local", name: "Andre", admin: true },
  kenneth: { email: "kenneth@bw.local", name: "Kenneth", admin: true },
  custa: { email: "custa@gmail.local", name: "Juan Dela Cruz", admin: false },
  custb: { email: "custb@gmail.local", name: "Maria Santos", admin: false },
  custc: { email: "custc@gmail.local", name: "Paolo Reyes", admin: false },
};
const VIA_LINK_GAME = "bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75";

async function sql(query, params) {
  const { default: pg } = await import("pg");
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

async function ensureUser(key) {
  const user = USERS[key];
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === user.email);
  if (existing) return existing.id;
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: user.name },
  });
  if (error) throw error;
  return data.user.id;
}

function line(index, gameId, gameName, productName, robux, quantity, unitPrice) {
  return {
    user_id: null, gamepass_id: crypto.randomUUID(), game_id: gameId, product_name: productName,
    game_name: gameName, robux_amount: robux, quantity, unit_price: unitPrice,
    line_total: unitPrice * quantity, is_via_plus: false, line_robux_amount: robux * quantity,
    line_cost: 0, line_profit: unitPrice * quantity,
  };
}

async function createOrder(orderNumber, owner, buyerName, roblox, lines) {
  const total = lines.reduce((sum, l) => sum + l.line_total, 0);
  const { error } = await supabase.rpc("create_store_order", {
    p_idempotency_key: `e2e-idempotency-${orderNumber}-xxxxxxxx`,
    p_request_fingerprint: "a".repeat(64),
    p_view_token_hash: "b".repeat(64),
    p_order_number: orderNumber,
    p_buyer_name: buyerName,
    p_buyer_roblox_username: roblox,
    p_total_amount: total,
    p_lines: lines,
    p_via_plus: null,
  });
  if (error && !String(error.message).includes("duplicate")) throw error;
  await sql("update public.store_order_snapshots set owner_user_id = $1 where order_number = $2 and owner_user_id is null", [owner, orderNumber]);
  await sql(
    `insert into public.store_order_messages (order_number, sender_role, sender_user_id, kind, body)
     values ($1, 'customer', $2, 'slip', $3) on conflict do nothing`,
    [orderNumber, owner, `BUDGETWISE ORDER SLIP\n\nName: ${buyerName}\nRoblox Username: ${roblox}\nOrder Number: ${orderNumber}`],
  );
}

export async function seed() {
  const ids = {};
  for (const key of Object.keys(USERS)) ids[key] = await ensureUser(key);
  for (const key of ["robert", "andre", "kenneth"]) {
    await sql(
      `insert into public.admin_users (user_id, display_name, unread_since) values ($1, $2, '-infinity')
       on conflict (user_id) do update set display_name = excluded.display_name`,
      [ids[key], USERS[key].name],
    );
  }

  await createOrder("BW-E2EAAA", ids.custa, "Juan Dela Cruz", "Juan123", [
    line(0, "11111111-1111-1111-1111-111111111111", "Blox Fruits", "Money", 450, 2, 125),
    line(1, "11111111-1111-1111-1111-111111111111", "Blox Fruits", "Mastery", 450, 2, 125),
    line(2, VIA_LINK_GAME, "Robux (Via Link)", "1,000 Robux", 1000, 1, 1000),
  ]);
  await createOrder("BW-E2ECCC", ids.custa, "Juan Dela Cruz", "Juan123", [
    line(0, VIA_LINK_GAME, "Robux (Via Link)", "500 Robux", 500, 3, 500),
  ]);
  await createOrder("BW-E2EBBB", ids.custb, "Maria Santos", "mariaRBX", [
    line(0, "22222222-2222-2222-2222-222222222222", "Grow a Garden", "VIP", 200, 1, 99),
  ]);

  // Official GCash account with a QR (1x1 PNG).
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const qrPath = `qr/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage.from("store-payment-qr").upload(qrPath, png, { contentType: "image/png" });
  if (uploadError) throw uploadError;
  const { rows } = await sql("select count(*)::int as n from public.store_payment_methods");
  if (rows[0].n === 0) {
    const { error } = await supabase.rpc("store_save_payment_method", {
      p_actor: ids.robert, p_id: null, p_label: "GCash", p_account_name: "A L M",
      p_account_number: "09171234567", p_qr_storage_path: qrPath, p_is_active: true, p_sort_order: 0,
    });
    if (error) throw error;
  }
  await seedArtworkFixtures();
  return ids;
}

/**
 * Peak-hour inbox: `count` extra conversations for customer A, newest last.
 * Every `longEvery`-th one has a long history (`longLength` messages); the
 * rest have a handful. Each thread ends with a unique marker message so a
 * test can tell exactly which conversation is on screen.
 */
export async function seedPeak(ids, { count = 35, longEvery = 5, longLength = 300 } = {}) {
  const orders = [];
  for (let i = 0; i < count; i += 1) {
    const orderNumber = `BW-PK${String(i).padStart(3, "0")}`;
    const name = `Peak Customer ${String(i).padStart(2, "0")}`;
    const roblox = `peakRBX${String(i).padStart(2, "0")}`;
    await createOrder(orderNumber, ids.custa, name, roblox, [
      line(0, "44444444-4444-4444-4444-444444444444", `Peak Game ${i % 4}`, `Peak Item ${i}`, 100, 1 + (i % 3), 50 + i),
    ]);
    const length = i % longEvery === 0 ? longLength : 6;
    await sql(
      `insert into public.store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
       select $1, case when g % 2 = 0 then 'customer' else 'admin' end,
              case when g % 2 = 0 then $2::uuid else $3::uuid end, 'text',
              case when g = $4 then $5 else 'history ' || g end,
              now() - interval '2 hours' + make_interval(secs => g + $6 * 10)
         from generate_series(1, $4) g`,
      [orderNumber, ids.custa, ids.robert, length, `LAST-${orderNumber}`, i],
    );
    orders.push({ orderNumber, name, roblox, length });
  }
  return orders;
}

/**
 * LOCAL-ONLY product artwork fixtures: the local stack has no catalog
 * tables, so this creates the two the artwork resolver reads and gives every
 * seeded order line a simple generated tile. Never runs against anything
 * but localhost (see the guard at the top of this file).
 */
export async function seedArtworkFixtures() {
  await sql(`create table if not exists public.roblox_gamepass_icon_cache (
    gamepass_id uuid primary key, status text not null, icon_url text)`);
  await sql(`create table if not exists public.product_artwork_overrides (
    gamepass_id uuid primary key, source text, icon_url text)`);
  await sql(`grant select on public.roblox_gamepass_icon_cache, public.product_artwork_overrides to service_role`);
  const palette = ["%237c3aed", "%230ea5e9", "%2316a34a", "%23f59e0b", "%23e11d48", "%230d9488"];
  const { rows } = await sql(`select distinct gamepass_id, product_name from public.store_order_line_snapshots where gamepass_id is not null`);
  for (const [index, row] of rows.entries()) {
    const initials = row.product_name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "BW";
    const svg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' rx='20' fill='${palette[index % palette.length]}'/><text x='48' y='60' font-size='32' font-weight='700' text-anchor='middle' fill='white' font-family='Arial'>${initials}</text></svg>`;
    await sql(
      `insert into public.roblox_gamepass_icon_cache (gamepass_id, status, icon_url) values ($1, 'matched', $2)
       on conflict (gamepass_id) do update set icon_url = excluded.icon_url`,
      [row.gamepass_id, svg],
    );
  }
}

/**
 * The mobile/customer-experience scenarios:
 *   custc (long-term): 23 completed, 2 in progress, 1 of them with an unread reply
 *   custa: orders with 1, 3, 10 and 20 products; the 20-product one also has
 *          a long text history and a payment card.
 */
export async function seedCustomerScenarios(ids) {
  const games = ["Blox Fruits", "Grow a Garden", "Pet Simulator 99", "Adopt Me!", "Brookhaven", "Murder Mystery 2"];
  const products = ["Money", "Mastery", "VIP", "2x Drops", "Fast Boats", "Fruit Notifier", "Dark Blade", "Storage", "Extra Pets", "Lucky Egg"];
  const lines = (count) =>
    Array.from({ length: count }, (_, i) => line(i, "55555555-5555-5555-5555-55555555555" + (i % 6), games[i % games.length], `${products[i % products.length]} ${Math.floor(i / products.length) + 1}`, 100 + i * 25, 1 + (i % 3 === 0 ? 2 : 0), 49 + i * 10));

  for (const count of [1, 3, 10, 20]) {
    await createOrder(`BW-X${String(count).padStart(2, "0")}`, ids.custa, "Juan Dela Cruz", "Juan123", lines(count));
  }
  // Long history + payment card on the 20-product order.
  await sql(
    `insert into public.store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
     select 'BW-X20', case when g % 3 = 0 then 'customer' else 'admin' end,
            case when g % 3 = 0 then $1::uuid else $2::uuid end, 'text',
            'History message ' || g || case when g % 7 = 0 then ' — a longer message that wraps over a couple of lines on a phone screen to make sure long text never overflows sideways.' else '' end,
            now() - interval '3 hours' + make_interval(secs => g * 20)
       from generate_series(1, 120) g`,
    [ids.custa, ids.robert],
  );

  const total = 23 + 2;
  for (let i = 0; i < total; i += 1) {
    const orderNumber = `BW-LT${String(i).padStart(3, "0")}`;
    await createOrder(orderNumber, ids.custc, "Paolo Reyes", "paoloRBX", lines(1 + (i % 4)));
  }
  await sql(`update public.store_order_snapshots set created_at = now() - make_interval(days => 60 - substr(order_number, 6)::int)
              where order_number like 'BW-LT%'`);
  const { rows } = await sql(
    `select c.order_number, c.last_message_id from public.store_order_conversations c
      where c.order_number like 'BW-LT%' and c.order_number < 'BW-LT023' and c.state = 'active'`,
  );
  for (const row of rows) {
    await sql(`select public.store_set_conversation_state($1, $2, 'done', $3)`, [row.order_number, ids.robert, row.last_message_id]);
  }
  await sql(`select public.store_post_message('BW-LT024', 'admin', $1, 'text', 'Hi po! We reviewed your order.', null, null, gen_random_uuid())`, [ids.robert]);
  await seedArtworkFixtures();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = await seed();
  console.log(JSON.stringify(ids, null, 2));
}
