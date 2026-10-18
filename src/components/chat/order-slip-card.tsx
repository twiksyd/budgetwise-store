"use client";

import { useId, useState } from "react";
import { BadgeCheck, ChevronDown, Clock, ReceiptText, ShoppingBag, Sparkles, Wallet } from "lucide-react";
import type { OrderSlipDto } from "@/lib/chat/dto.mjs";
import { describeOrderItems } from "@/lib/chat/order-summary.mjs";
import { formatOrderStatus } from "@/components/order-chat/order-status-badge";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const DATE = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
});

const FRESH_MS = 90_000;

const PAYMENT: Record<OrderSlipDto["payment"], { customer: string; admin: string; icon: typeof Clock; tone: string }> = {
  awaiting: {
    customer: "Waiting for payment details",
    admin: "Payment details not sent",
    icon: Clock,
    tone: "bg-muted text-muted-foreground",
  },
  sent: {
    customer: "Pay using this order's payment card",
    admin: "Payment details sent",
    icon: Wallet,
    tone: "bg-primary/10 text-primary",
  },
  received: {
    customer: "Payment received ✓",
    admin: "Paid ✓",
    icon: BadgeCheck,
    tone: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200",
  },
};

/**
 * One order inside the customer's ongoing conversation (0033). Compact by
 * default — number, what was ordered, total and where it stands — with the
 * full item list one tap away, so several orders in one thread stay easy
 * to tell apart without flooding it. Built from the order's records only.
 */
export function OrderSlipCard({
  order,
  createdAt,
  isMine,
  viewer,
}: {
  order: OrderSlipDto;
  createdAt: string;
  isMine: boolean;
  viewer: "customer" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const thumbs = [...new Set(order.items.map((item) => item.imageUrl).filter((url): url is string => Boolean(url)))].slice(0, 3);
  const payment = PAYMENT[order.payment];
  const PaymentIcon = payment.icon;
  const at = Date.parse(createdAt);
  const fresh = Number.isFinite(at) && Date.now() - at < FRESH_MS;

  return (
    <article
      className={cn(
        "bg-background text-foreground w-full max-w-[19rem] overflow-hidden rounded-2xl border shadow-sm",
        order.payment === "received" ? "border-emerald-600/25 dark:border-emerald-400/25" : "border-border",
        fresh && "bw-card-in",
        isMine ? "ml-auto" : "",
      )}
      data-order-slip={order.orderNumber}
      aria-label={`Order ${order.orderNumber}`}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3">
        <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full">
          <ReceiptText className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
            Order placed{order.createdAt ? ` · ${DATE.format(new Date(order.createdAt))}` : ""}
          </p>
          <p className="font-heading text-[15px] leading-tight font-semibold [font-variant-numeric:tabular-nums]">
            {order.orderNumber}
          </p>
        </div>
        {order.fromRecommendation && (
          <span
            className="bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            title={viewer === "admin" ? "Ordered from a product card sent in this chat" : "Ordered from BudgetWise's pick"}
          >
            <Sparkles className="size-3" aria-hidden />
            {viewer === "admin" ? "From card" : "Our pick"}
          </span>
        )}
      </header>

      <div className="flex items-center gap-3 px-3.5 pt-2.5">
        <div className="flex shrink-0 -space-x-2.5">
          {thumbs.length ? (
            thumbs.slice(0, 2).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
              <img key={src} src={src} alt="" loading="lazy" className="ring-background size-9 rounded-lg object-cover ring-2" />
            ))
          ) : (
            <span className="bg-muted flex size-9 items-center justify-center rounded-lg">
              <ShoppingBag className="text-muted-foreground size-4" aria-hidden />
            </span>
          )}
        </div>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{describeOrderItems(order.items)}</p>
        <p className="font-heading shrink-0 text-base font-bold [font-variant-numeric:tabular-nums]">{formatPrice(order.total)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-2.5 pb-3">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", payment.tone)}>
          <PaymentIcon className="size-3" aria-hidden />
          {viewer === "admin" ? payment.admin : payment.customer}
        </span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
          {formatOrderStatus(order.status)}
        </span>
      </div>

      {order.items.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={listId}
            className="border-border/60 hover:bg-muted/50 text-primary flex min-h-10 w-full items-center justify-center gap-1 border-t text-xs font-semibold transition-colors duration-150"
          >
            {open ? "Hide items" : `View ${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`}
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </button>
          <div
            id={listId}
            className={cn(
              "grid transition-[grid-template-rows] duration-250 ease-out motion-reduce:transition-none",
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <ul className="min-h-0 overflow-hidden" aria-hidden={!open}>
              {order.items.map((item, index) => (
                <li key={index} className="border-border/50 flex items-center gap-2.5 border-t px-3.5 py-2">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
                    <img src={item.imageUrl} alt="" loading="lazy" className="size-8 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="bg-muted size-8 shrink-0 rounded-md" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{item.productName}</p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      {item.gameName}
                      {item.quantity > 1 ? ` · Qty ${item.quantity}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold [font-variant-numeric:tabular-nums]">{formatPrice(item.lineTotal)}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </article>
  );
}
