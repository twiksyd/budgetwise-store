import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth/customer";
import { loadCustomerOrderSection } from "@/lib/queries/order-chat";
import { MyOrdersView } from "@/components/order-chat/my-orders-view";
import { SignOutLink } from "@/components/auth/sign-out-link";

export const metadata: Metadata = {
  title: "My Orders",
  robots: { index: false, follow: false },
};

export default async function MyOrdersPage() {
  const customer = await requireCustomer("/account/orders");
  // Unread + in progress first (all of them); completed history 20 at a time.
  const [open, completed] = await Promise.all([
    loadCustomerOrderSection(customer.id, "open"),
    loadCustomerOrderSection(customer.id, "completed"),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">My Orders</h1>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            Your purchases and your chats with BudgetWise · {customer.email ?? customer.name}
          </p>
        </div>
        <SignOutLink />
      </div>
      <MyOrdersView initialOpen={open} initialCompleted={completed} />
    </div>
  );
}
