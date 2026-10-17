import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Scoped to the routes that read a signed-in session — /admin, and the
// customer-account surfaces (login, checkout, orders, chat API). The public
// catalog has no session state to refresh, and running this on every catalog
// request would add cookie overhead to pages that are otherwise cacheable.
export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/auth/:path*",
    "/checkout/:path*",
    "/account/:path*",
    "/orders/:path*",
    "/api/orders",
    "/api/order-chat/:path*",
    "/api/admin/:path*",
  ],
};
