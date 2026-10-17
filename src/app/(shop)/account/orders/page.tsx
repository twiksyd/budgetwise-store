import type { Metadata } from "next";
import { MyOrdersView } from "@/components/order-chat/my-orders-view";
import { AccountEmail } from "@/components/customer-messages/account-email";
import { SignOutLink } from "@/components/auth/sign-out-link";

export const metadata: Metadata = {
  title: "My Orders",
  robots: { index: false, follow: false },
};

// A static shell: nothing here waits for the session or the database, so
// the page is prefetched in full and appears the moment "Orders" is tapped.
// The orders load in the browser from /api/account/orders, which checks the
// session itself (signed-out visitors are sent to login from there).
export default function MyOrdersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">My Orders</h1>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            Your purchases and your chats with BudgetWise
            <AccountEmail />
          </p>
        </div>
        <SignOutLink />
      </div>
      <MyOrdersView />
    </div>
  );
}
