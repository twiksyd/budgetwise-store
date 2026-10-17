import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/order-chat.mjs";

export interface CustomerUser {
  id: string;
  email: string | null;
  name: string | null;
}

// getUser() re-validates the session's JWT with Supabase Auth on every call,
// unlike getSession(), which would trust whatever the cookie says.
export async function getCustomerUser(): Promise<CustomerUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const metadata = user.user_metadata as Record<string, unknown> | null;
  const rawName = metadata?.full_name ?? metadata?.name;

  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof rawName === "string" && rawName.trim() ? rawName.trim() : null,
  };
}

export function buildLoginPath(nextPath: string) {
  return `/login?next=${encodeURIComponent(sanitizeNextPath(nextPath))}`;
}

export async function requireCustomer(nextPath: string): Promise<CustomerUser> {
  const user = await getCustomerUser();
  if (!user) redirect(buildLoginPath(nextPath));
  return user;
}
