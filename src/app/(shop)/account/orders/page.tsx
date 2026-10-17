import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderStatusBadge } from "@/components/order-chat/order-status-badge";
import { Price } from "@/components/shared/price";
import { requireCustomer } from "@/lib/auth/customer";
import { listCustomerOrders } from "@/lib/queries/order-chat";
import { SignOutLink } from "@/components/auth/sign-out-link";

export const metadata: Metadata = {
  title: "My Orders",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function MyOrdersPage() {
  const customer = await requireCustomer("/account/orders");
  const orders = await listCustomerOrders(customer.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            My Orders
          </h1>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {customer.email ?? customer.name}
          </p>
        </div>
        <SignOutLink />
      </div>

      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={ShoppingBag}
            title="Wala pa kayong orders"
            description="Kapag nag-order na kayo, makikita dito ang order at ang chat namin."
            action={{ label: "Mag-browse ng Games", href: "/games" }}
          />
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.orderNumber}>
              <Link
                href={`/orders/${encodeURIComponent(order.orderNumber)}`}
                className="surface-premium hover:bg-muted/40 flex items-center gap-3 rounded-2xl p-4 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-sm font-semibold">
                      {order.orderNumber}
                    </p>
                    <OrderStatusBadge status={order.status} />
                    {order.unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        {order.unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {order.lastMessagePreview
                      ? `${order.lastSenderRole === "admin" ? "BudgetWise" : "You"}: ${order.lastMessagePreview}`
                      : "No messages yet"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {dateFormatter.format(new Date(order.createdAt))}
                  </p>
                </div>
                <Price amount={order.totalAmount} variant="line" />
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
