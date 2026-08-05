import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Anon-key client with no cookie binding, for catalog reads that don't
 * depend on a customer session. Using this instead of the cookie-aware
 * server client (src/lib/supabase/server.ts) keeps catalog pages eligible
 * for static rendering / ISR — calling next/headers' cookies() forces a
 * route into fully dynamic rendering, which we don't want for /games.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
