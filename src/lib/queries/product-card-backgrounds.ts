import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

function isMissingCardBackgroundTableError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("store_product_card_backgrounds") === true
  );
}

export async function getProductCardBackgroundUrlMap(
  gamepassIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(gamepassIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_product_card_backgrounds")
    .select("gamepass_id, image_url")
    .in("gamepass_id", ids);

  if (error) {
    if (isMissingCardBackgroundTableError(error)) return new Map();
    throw error;
  }

  return new Map((data ?? []).map((row) => [row.gamepass_id, row.image_url]));
}
