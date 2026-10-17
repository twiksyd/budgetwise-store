import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Scoped to the routes that read a signed-in session — /admin, and the
// customer-account surfaces (login, checkout, orders). The public catalog
// has no session state to refresh, and running this on every catalog
// request would add cookie overhead to pages that are otherwise cacheable.
//
// The chat and admin JSON APIs (/api/order-chat, /api/admin) are left out on
// purpose: every one of those handlers verifies the session itself
// (supabase.auth.getUser, which also refreshes and re-sets an expired
// session cookie from a route handler). Running the middleware too made each
// call verify the session twice — two sequential Supabase Auth round trips
// on every message and order-details request.
export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/auth/:path*",
    "/checkout/:path*",
    "/account/:path*",
    "/orders/:path*",
    "/api/orders",
  ],
};
