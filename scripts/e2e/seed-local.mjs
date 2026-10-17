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

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = await seed();
  console.log(JSON.stringify(ids, null, 2));
}
