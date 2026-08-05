import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AdminDatabase } from "@/types/database-admin";

/**
 * Service-role Supabase client. Bypasses RLS — use only for validated,
 * server-only order writes (see src/app/api/orders/route.ts). Never import
 * this from a Client Component or anything bundled to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient<AdminDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
