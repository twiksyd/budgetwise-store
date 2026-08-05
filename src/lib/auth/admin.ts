import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AdminUser {
  id: string;
  email: string | null;
}

// Verified two ways: getUser() re-validates the session's JWT against
// Supabase Auth (unlike getSession(), which just trusts the cookie), and
// admin_users is only ever read through the service-role client — RLS on
// that table denies anon/authenticated entirely, so even a stolen session
// cookie for a non-admin Supabase Auth account can't read or infer it.
export async function getAdminUser(): Promise<AdminUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();
  const { data: adminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) return null;

  return { id: user.id, email: user.email ?? null };
}

// Every admin page AND every admin Server Action calls this itself — a
// layout-level check alone isn't enough, since a Server Action is an
// independently callable endpoint regardless of which page's form
// triggered it.
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login?denied=1");
  return admin;
}
