import type { Metadata } from "next";
import Link from "next/link";
import { Activity, LayoutGrid, RefreshCw } from "lucide-react";
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
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-heading text-sm font-semibold">
              BudgetWise Admin
            </p>
            <p className="text-muted-foreground text-xs">{admin.email}</p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/admin/store-operations"
                className="hover:bg-muted rounded-lg px-2.5 py-1.5"
              >
                Operations
              </Link>
              <Link
                href="/admin/product-assets"
                className="hover:bg-muted rounded-lg px-2.5 py-1.5"
              >
                Product Assets
              </Link>
              <Link
                href="/admin/catalog-layout"
                className="hover:bg-muted inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              >
                <LayoutGrid className="size-3.5" />
                Catalog Layout
              </Link>
              <Link
                href="/admin/roblox-sync"
                className="hover:bg-muted inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              >
                <RefreshCw className="size-3.5" />
                Roblox Sync
              </Link>
              <Link
                href="/admin/catalog-health"
                className="hover:bg-muted inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              >
                <Activity className="size-3.5" />
                Catalog Health
              </Link>
            </nav>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
