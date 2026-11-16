import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Catalog credentials are missing");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const name of ["Karinderya", "Pa Deliber"]) {
  const { data: games, error: gameError } = await supabase
    .from("games")
    .select("id,name")
    .ilike("name", name);
  if (gameError) throw gameError;
  if (games.length !== 1) throw new Error(`Expected exactly one ${name} game, found ${games.length}`);

  const { data: passes, count, error: passesError } = await supabase
    .from("gamepasses")
    .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
    .eq("game_id", games[0].id)
    .order("name");
  if (passesError) throw passesError;
  if (count !== passes.length) throw new Error(`Incomplete ${name} inventory`);
  console.log(JSON.stringify({ game: games[0], passes }));
}
