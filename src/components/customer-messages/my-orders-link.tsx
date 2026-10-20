"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";
import { badgeText } from "@/lib/chat/order-summary.mjs";
import { cn } from "@/lib/utils";

/**
 * "Orders" in the header, visible on phones without opening the menu —
 * where customers check their purchases and BudgetWise's replies. Shows the
 * server's unread count.
 */
export function MyOrdersHeaderLink() {
  const messages = useCustomerMessages();
  const pathname = usePathname();
  const active = pathname?.startsWith("/account/orders") ?? false;
  const badge = badgeText(messages?.totalUnread ?? 0);
  return (
    <Link
      href="/account/orders"
      aria-label={badge ? `My Orders (${messages?.totalUnread} unread messages)` : "My Orders"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "hover:bg-muted active:bg-muted relative inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-[background-color,transform] duration-75 active:scale-95 motion-reduce:active:scale-100 sm:hidden",
        active && "bg-muted",
      )}
    >
      <ReceiptText className="size-4" />
      <span>Orders</span>
      {badge && (
        <span className="ring-background absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2">
          {badge}
        </span>
      )}
    </Link>
  );
}

/** Desktop nav "My orders" with the same unread badge. */
export function MyOrdersNavBadge() {
  const messages = useCustomerMessages();
  const badge = badgeText(messages?.totalUnread ?? 0);
  if (!badge) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 align-middle text-[10px] font-bold text-white">
      {badge}
    </span>
  );
}
