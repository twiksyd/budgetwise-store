import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error("Public catalog credentials are missing");
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const id = "88faeed8-f356-4f06-8dfc-754856f61468";
for (const [field, value] of [["id", id], ["slug", "markado"]]) {
  const { data, error } = await client.from("store_games")
    .select("id,name,slug,availability_status").eq(field, value).maybeSingle();
  if (error) throw error;
  console.log(JSON.stringify({ field, value, game: data }));
}
