import { createClient } from "@supabase/supabase-js";

const gameId = "ca3463cd-4033-4505-b6a8-441d450df10a";
const product = {
  game_id: gameId,
  name: "Backfire Pro",
  robux_amount: 59,
  your_price: 25,
  your_cost: 17.7,
  is_active: true,
  availability_status: "available",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Production catalog credentials are missing");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: game, error: gameError } = await supabase
  .from("games")
  .select("id,name")
  .eq("id", gameId)
  .single();
if (gameError) throw gameError;
if (game.name.trim().toLowerCase() !== "drag drive simulator") {
  throw new Error("The target game ID does not match Drag Drive Simulator");
}

const { data: passes, count, error: passesError } = await supabase
  .from("gamepasses")
  .select("id,user_id,name,robux_amount,your_price,your_cost,is_active,availability_status", { count: "exact" })
  .eq("game_id", gameId);
if (passesError) throw passesError;
if (count !== passes.length) throw new Error("Could not inspect every existing gamepass");

const owners = [...new Set(passes.map((pass) => pass.user_id))];
if (owners.length !== 1 || !owners[0]) throw new Error("Expected one existing catalog owner for Drag Drive Simulator");

const sameName = passes.filter((pass) => pass.name.trim().toLowerCase() === product.name.toLowerCase());
if (sameName.length > 1) throw new Error("Multiple Backfire Pro rows already exist; no change made");
if (sameName.length === 1) {
  const pass = sameName[0];
  if (
    pass.robux_amount !== product.robux_amount ||
    Number(pass.your_price) !== product.your_price ||
    Number(pass.your_cost) !== product.your_cost ||
    !pass.is_active ||
    pass.availability_status !== "available"
  ) {
    throw new Error("Backfire Pro already exists with different values or availability; no change made");
  }
  console.log(`Already present with requested values: ${pass.id}`);
  process.exit(0);
}

const { data: created, error: insertError } = await supabase
  .from("gamepasses")
  .insert({ ...product, user_id: owners[0] })
  .select("id,name,robux_amount,your_price,your_cost,is_active,availability_status")
  .single();
if (insertError) throw insertError;

const { data: visible, error: viewError } = await supabase
  .from("store_gamepasses")
  .select("id,game_id,name,robux_amount,price,availability_status")
  .eq("id", created.id)
  .single();
if (viewError) throw viewError;
if (
  visible.game_id !== gameId ||
  visible.name !== product.name ||
  visible.robux_amount !== product.robux_amount ||
  Number(visible.price) !== product.your_price ||
  visible.availability_status !== "available"
) {
  throw new Error("Inserted product did not match the public catalog view");
}

console.log(`Created ${visible.name}: ${visible.robux_amount} Robux, PHP ${visible.price}, cost PHP ${created.your_cost}, id ${visible.id}`);
