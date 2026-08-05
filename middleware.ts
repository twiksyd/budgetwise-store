import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Scoped to /admin only — the public storefront has no session state to
// refresh, and running this on every catalog request would add cookie
// overhead to pages that are otherwise cacheable.
export const config = {
  matcher: ["/admin/:path*"],
};
