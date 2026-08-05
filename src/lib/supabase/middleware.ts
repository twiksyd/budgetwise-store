import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

// Refreshes the Supabase Auth session cookie on every /admin request so a
// Server Component's session doesn't silently expire mid-navigation. This
// only touches auth cookies — it doesn't do any authorization itself (see
// src/lib/auth/admin.ts for the actual admin check, which every admin page
// and Server Action re-runs on the server regardless of what this sees).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touching getUser() is what actually triggers the refresh when the
  // access token is stale — a no-op read would leave expired sessions in
  // place until they hard-fail elsewhere.
  await supabase.auth.getUser();

  return response;
}
