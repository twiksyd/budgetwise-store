import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { SignOutButton } from "@/components/admin/sign-out-button";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/60 border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="font-heading text-sm font-semibold">
              BudgetWise Admin
            </p>
            <p className="text-muted-foreground text-xs">{admin.email}</p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
