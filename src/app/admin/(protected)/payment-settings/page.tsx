import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { listPaymentMethods } from "@/lib/queries/order-chat";
import { PaymentSettingsManager } from "@/components/admin-inbox/payment-settings-manager";

export const metadata: Metadata = { title: "Payment Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaymentSettingsPage() {
  // Must run before any privileged read.
  await requireAdmin();
  const methods = await listPaymentMethods();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Payment Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The official account used by “Send payment details” in Order Chats. Customers only ever see these details inside
          a payment card for their own order. Every change is recorded with who made it.
        </p>
      </div>
      <PaymentSettingsManager initialMethods={methods} />
    </div>
  );
}
