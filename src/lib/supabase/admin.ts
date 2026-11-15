import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AdminDatabase } from "@/types/database-admin";

/**
 * Service-role Supabase client. Bypasses RLS — use only for validated,
 * server-only order writes (see src/app/api/orders/route.ts). Never import
 * this from a Client Component or anything bundled to the browser.
 */
export function createAdminClient() {
  const buildMockUrl = process.env.SUPABASE_BUILD_MOCK_URL;
  const useReadOnlyBuildMock =
    process.env.CLOUDFLARE_BUILD === "1" && Boolean(buildMockUrl);

  return createSupabaseClient<AdminDatabase>(
    useReadOnlyBuildMock
      ? buildMockUrl!
      : process.env.NEXT_PUBLIC_SUPABASE_URL!,
    useReadOnlyBuildMock
      ? "build-only-placeholder"
      : process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
