import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getProductDisplayName } from "@/lib/product-display-name";
import { MAX_DISTINCT_ORDER_ITEMS } from "@/lib/validations/order";
import type { StoreGame, StoreGamepass } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// GET ?ids=<uuid>,<uuid>: the CURRENT public catalog values for the items in
// a cart (name, price, Robux, availability). Checkout shows any change
// before the customer submits; the order API prices everything again on
// the server regardless, so this is display only. Public data, no auth.
export async function GET(request: Request) {
  const ids = [
    ...new Set(
      (new URL(request.url).searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter((id) => UUID_RE.test(id)),
    ),
  ].slice(0, MAX_DISTINCT_ORDER_ITEMS);
  if (ids.length === 0) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    const supabase = createPublicClient();
    const { data: passes, error } = await supabase.from("store_gamepasses").select("*").in("id", ids);
    if (error) throw error;
    const gameIds = [...new Set((passes ?? []).map((pass) => pass.game_id))];
    const { data: games, error: gamesError } = gameIds.length
      ? await supabase.from("store_games").select("*").in("id", gameIds)
      : { data: [] as StoreGame[], error: null };
    if (gamesError) throw gamesError;
    const gameById = new Map((games ?? []).map((game) => [game.id, game as StoreGame]));
    const found = new Map((passes ?? []).map((pass) => [pass.id, pass as StoreGamepass]));
    const items = ids.map((id) => {
      const pass = found.get(id);
      const game = pass ? gameById.get(pass.game_id) : undefined;
      if (!pass || !game) return { gamepassId: id, available: false, listed: false };
      return {
        gamepassId: id,
        listed: true,
        available: (pass.availability_status ?? "available") === "available" && (game.availability_status ?? "available") === "available",
        name: getProductDisplayName(pass),
        price: Number(pass.price),
        robuxAmount: Number(pass.robux_amount),
      };
    });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Catalog revalidation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not check current prices." }, { status: 503 });
  }
}
