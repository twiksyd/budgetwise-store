import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

function missing(error: { code?: string }) {
  return ["42P01", "42703", "PGRST205", "PGRST202"].includes(error.code ?? "");
}
/** Called only after the existing session/owner gate. One batch, no per-order auth. */
export async function conversationSources(key: string): Promise<string[]> {
  const { data, error } = await createAdminClient().from("store_chat_active_history").select("source_key").eq("home_key", key);
  if (error && !missing(error)) throw error;
  return [key, ...(data ?? []).map((row) => row.source_key)];
}
/** A mapped source remains read-only even with presentation disabled. */
export async function historicalHome(key: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("store_chat_history_links").select("home_key").eq("source_key", key).maybeSingle();
  if (error && !missing(error)) throw error;
  return data?.home_key ?? null;
}
export async function linkCompletedHistory(key: string, actor: string) {
  const { error } = await createAdminClient().rpc("store_link_historical_chat", { p_source: key, p_actor: actor });
  if (error && !missing(error)) throw error;
}
