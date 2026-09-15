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

// Decorative — a failure here should render normal cards, not break the
// page. Use on customer-facing catalog pages instead of the throwing
// version above.
export async function getProductCardBackgroundUrlMapSafe(
  gamepassIds: string[],
): Promise<Map<string, string>> {
  try {
    return await getProductCardBackgroundUrlMap(gamepassIds);
  } catch (error) {
    console.error("Failed to load product card backgrounds", error);
    return new Map();
  }
}
