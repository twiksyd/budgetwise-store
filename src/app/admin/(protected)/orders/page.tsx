import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { listAdminInbox } from "@/lib/queries/order-chat";
import { previewMessage } from "@/lib/order-chat.mjs";
import { OrderStatusBadge } from "@/components/order-chat/order-status-badge";
import { formatPrice } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Order Chats",
  robots: { index: false, follow: false },
};

// Always fresh: this is the page you leave open waiting for customers.
export const dynamic = "force-dynamic";

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function AdminOrdersPage() {
  // Must run before any privileged read.
  await requireAdmin();
  const inbox = await listAdminInbox();
  const unreadOrders = inbox.filter((item) => item.unreadCount > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Order Chats
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {unreadOrders > 0
            ? `${unreadOrders} order${unreadOrders === 1 ? "" : "s"} waiting for your reply or review.`
            : "You're all caught up."}
        </p>
      </div>

      {inbox.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          No customer chats yet. New orders will show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {inbox.map((item) => (
            <li key={item.orderNumber}>
              <Link
                href={`/admin/orders/${encodeURIComponent(item.orderNumber)}`}
                className="hover:bg-muted/50 border-border/60 flex items-start gap-3 rounded-xl border p-3.5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{item.orderNumber}</p>
                    <OrderStatusBadge status={item.status} />
                    {item.unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        {item.unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {item.buyerName} · Roblox: {item.buyerRobloxUsername} ·{" "}
                    {formatPrice(item.totalAmount)}
                  </p>
                  <p
                    className={
                      item.unreadCount > 0
                        ? "mt-1 truncate text-sm font-medium"
                        : "text-muted-foreground mt-1 truncate text-sm"
                    }
                  >
                    {item.lastSenderRole === "admin" ? "You: " : ""}
                    {previewMessage({
                      kind: item.lastMessageKind,
                      body: item.lastMessageBody,
                    })}
                  </p>
                </div>
                <time
                  dateTime={item.lastMessageAt}
                  suppressHydrationWarning
                  className="text-muted-foreground shrink-0 text-xs"
                >
                  {timeFormatter.format(new Date(item.lastMessageAt))}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
