import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import {
  listPaymentMethods,
  listQuickReplies,
  loadAdminDirectory,
  loadInboxPage,
} from "@/lib/queries/order-chat";
import { InboxProvider } from "@/components/admin-inbox/inbox-provider";
import { InboxShell } from "@/components/admin-inbox/inbox-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/admin/sign-out-button";

export const metadata: Metadata = {
  title: "Order Chats",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Stays mounted while admins switch conversations (only the
// [orderNumber] segment re-renders), so the inbox, its realtime channel and
// presence survive navigation.
export default async function AdminInboxLayout({ children }: { children: React.ReactNode }) {
  // Must run before any privileged read.
  const admin = await requireAdmin();
  const [directory, initialPage, quickReplies, paymentMethods] = await Promise.all([
    loadAdminDirectory(),
    loadInboxPage(admin.id),
    listQuickReplies(),
    listPaymentMethods({ activeOnly: true }),
  ]);

  return (
    <div className="bg-background flex h-dvh flex-col">
      <header className="border-border/60 flex items-center gap-3 border-b px-3 py-2 sm:px-4">
        <p className="font-heading hidden shrink-0 text-sm font-semibold sm:block">BudgetWise Admin</p>
        <div className="min-w-0 flex-1">
          <AdminNav />
        </div>
        <SignOutButton />
      </header>
      <InboxProvider
        me={admin.id}
        directory={directory}
        initialPage={initialPage}
        initialQuickReplies={quickReplies.map((reply) => ({
          id: reply.id,
          shortcut: reply.shortcut,
          title: reply.title,
          body: reply.body,
          isEnabled: reply.isEnabled,
        }))}
        paymentMethods={paymentMethods.map((method) => ({
          id: method.id,
          provider: method.provider,
          label: method.label,
          accountName: method.accountName,
          accountNumber: method.accountNumber,
          hasQr: method.hasQr,
        }))}
      >
        <InboxShell>{children}</InboxShell>
      </InboxProvider>
    </div>
  );
}
