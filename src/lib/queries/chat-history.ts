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

export interface HistorySource {
  sourceKey: string;
  unread: number;
  firstUnreadId: string | null;
}
/** Batched across an inbox page; customer payloads never expose staff identities/cursors. */
export async function historySourceStatus(keys: string[], admin?: string): Promise<Record<string, HistorySource[]>> {
  if (!keys.length) return {};
  const { data, error } = await createAdminClient().rpc("store_history_sources", { p_homes: keys, ...(admin ? { p_admin: admin } : {}) });
  if (error && !missing(error)) throw error;
  const result: Record<string, HistorySource[]> = {};
  for (const row of data ?? []) (result[row.home_key] ??= []).push({ sourceKey: row.source_key, unread: admin ? row.admin_unread : row.customer_unread, firstUnreadId: admin ? row.first_admin_unread : row.first_customer_unread });
  return result;
}
