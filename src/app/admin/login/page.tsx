import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Store Operations
      </h1>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Sign in with your admin account.
      </p>
      {denied && (
        <p className="border-destructive/30 bg-destructive/10 text-destructive mt-5 rounded-lg border px-3.5 py-2.5 text-sm">
          That account isn&apos;t authorized for Store Operations.
        </p>
      )}
      <div className="mt-8">
        <LoginForm />
      </div>
    </div>
  );
}
