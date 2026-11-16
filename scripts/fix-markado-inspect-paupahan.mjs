import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Catalog credentials are missing");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const gameId = "88faeed8-f356-4f06-8dfc-754856f61468";
const { data: game, error: gameError } = await supabase.from("games")
  .select("id,name").eq("id", gameId).single();
if (gameError) throw gameError;
if (!["Merkado", "Markado"].includes(game.name)) throw new Error("Wrong game ID for Markado correction");
const { data: passes, count, error: passError } = await supabase.from("gamepasses")
  .select("id,name", { count: "exact" }).eq("game_id", gameId);
if (passError) throw passError;
if (passes.length !== 11 || count !== 11) throw new Error("Markado pass count changed; no rename made");
if (game.name !== "Markado") {
  const { error } = await supabase.from("games").update({ name: "Markado" })
    .eq("id", gameId).eq("name", "Merkado");
  if (error) throw error;
}
const { data: visible, error: viewError } = await supabase.from("store_games")
  .select("id,name,slug").eq("id", gameId).single();
if (viewError) throw viewError;
if (visible.name !== "Markado" || visible.slug !== "markado") throw new Error("Markado public name verification failed");
console.log(`Verified ${visible.name} at /games/${visible.slug} with 11 existing passes`);

const { data: paupahan, error: paupahanError } = await supabase.from("games")
  .select("id,name,user_id,category,color,icon_url,sort_order,availability_status")
  .ilike("name", "Paupahan");
if (paupahanError) throw paupahanError;
if (paupahan.length !== 1) throw new Error(`Expected one Paupahan game; found ${paupahan.length}`);
const { data: products, count: productCount, error: productError } = await supabase.from("gamepasses")
  .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
  .eq("game_id", paupahan[0].id).order("name");
if (productError) throw productError;
if (products.length !== productCount) throw new Error("Incomplete Paupahan inventory");
console.log(JSON.stringify({ game: paupahan[0], passes: products }));
