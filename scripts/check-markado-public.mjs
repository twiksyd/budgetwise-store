import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !key) throw new Error("Catalog credentials are missing");
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const id = "88faeed8-f356-4f06-8dfc-754856f61468";
for (const [field, value] of [["id", id], ["slug", "markado"]]) {
  const { data, error } = await client.from("store_games")
    .select("id,name,slug,availability_status").eq(field, value);
  if (error) throw error;
  console.log(JSON.stringify({ field, value, games: data }));
  if (field !== "slug") continue;
  for (const game of data) {
    const { data: passes, count, error: passError } = await admin.from("gamepasses")
      .select("id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
      .eq("game_id", game.id).order("name");
    if (passError) throw passError;
    if (passes.length !== count) throw new Error("Incomplete Markado inventory");
    console.log(JSON.stringify({ gameId: game.id, passes }));
  }
}
