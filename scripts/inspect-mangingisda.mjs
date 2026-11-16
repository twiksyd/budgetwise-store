import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Catalog credentials are missing");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const slug = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

const { data: games, count, error: gameError } = await supabase.from("games")
  .select("id,user_id,name,category,sort_order,availability_status,icon_url", { count: "exact" })
  .order("name");
if (gameError) throw gameError;
if (games.length !== count) throw new Error("Incomplete game inventory");
console.log(JSON.stringify({ gameCount: games.length, names: games.map((game) => game.name) }));
const matches = games.filter((game) => /mang|isda|fish/i.test(game.name) || slug(game.name) === "mangingisda");
console.log(JSON.stringify({ matches }));
for (const game of matches) {
  const { data: passes, count: passCount, error: passError } = await supabase.from("gamepasses")
    .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
    .eq("game_id", game.id).order("name");
  if (passError) throw passError;
  if (passes.length !== passCount) throw new Error("Incomplete pass inventory");
  console.log(JSON.stringify({ gameId: game.id, passes }));
}
