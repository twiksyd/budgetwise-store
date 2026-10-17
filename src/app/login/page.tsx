import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getCustomerUser } from "@/lib/auth/customer";
import { sanitizeNextPath } from "@/lib/order-chat.mjs";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = sanitizeNextPath(rawNext);

  if (await getCustomerUser()) redirect(nextPath);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Mag-sign in
      </h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Sign in to place your order and chat with us right here on the website.
        Dito rin makikita ang lahat ng inyong orders.
      </p>

      {params.error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive mt-5 rounded-lg border px-3.5 py-2.5 text-sm"
        >
          Hindi natuloy ang sign in. Please try again.
        </p>
      )}

      <div className="mt-8">
        <GoogleSignInButton nextPath={nextPath} />
      </div>

      <p className="text-muted-foreground mt-6 flex items-start gap-2 text-xs leading-relaxed">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Google lang ang ginagamit namin para sa sign in. Hindi namin nakikita ang
        inyong Google password.
      </p>
    </div>
  );
}
