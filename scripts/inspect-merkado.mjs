import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Catalog credentials are missing");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: games, error: gameError } = await supabase.from("games")
  .select("*").order("name");
if (gameError) throw gameError;
console.log(JSON.stringify({ games }));
const matching = games.filter((game) => game.name.toLowerCase().includes("merkado"));
if (matching.length !== 1) throw new Error(`Expected one Merkado game; found ${matching.length}`);
const { data: passes, count, error: passError } = await supabase.from("gamepasses")
  .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
  .eq("game_id", matching[0].id).order("name");
if (passError) throw passError;
if (passes.length !== count) throw new Error("Incomplete Merkado inventory");
console.log(JSON.stringify({ game: matching[0], passes }));
