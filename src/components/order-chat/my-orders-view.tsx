"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, MessageCircle, ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { formatOrderStatus } from "@/components/order-chat/order-status-badge";
import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";
import { fetchJson } from "@/lib/chat/client/fetch-json";
import { badgeText, orderOpenSection } from "@/lib/chat/order-summary.mjs";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export interface MyOrderCard {
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  robloxUsername: string;
  status: string;
  state: "active" | "done";
  doneAt: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderRole: "customer" | "admin" | null;
  paymentSent: boolean;
  summary: string;
  thumbnails: string[];
}
type Cursor = { at: string; orderNumber: string } | null;
type Section = { rows: MyOrderCard[]; nextCursor: Cursor };

const DATE = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

/**
 * My Orders for customers with 1 or 50+ orders: orders with a new reply
 * first, then everything still in progress, then completed orders — the
 * completed history loads 20 at a time. Updates live (new replies, Done,
 * reopened) without a refresh.
 */
export function MyOrdersView({ initialOpen, initialCompleted }: { initialOpen: Section; initialCompleted: Section }) {
  const messages = useCustomerMessages();
  const [open, setOpen] = useState(initialOpen.rows);
  const [completed, setCompleted] = useState(initialCompleted.rows);
  const [cursor, setCursor] = useState<Cursor>(initialCompleted.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstVersion = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [openBody, completedBody] = await Promise.all([
        fetchJson<Section>("/api/account/orders?section=open"),
        fetchJson<Section>("/api/account/orders?section=completed"),
      ]);
      setOpen(openBody.rows);
      setCompleted((current) => {
        // Fresh first page + any older pages already loaded (minus orders that reopened).
        const fresh = new Set(completedBody.rows.map((row) => row.orderNumber));
        const reopened = new Set(openBody.rows.map((row) => row.orderNumber));
        const older = current.filter((row) => !fresh.has(row.orderNumber) && !reopened.has(row.orderNumber));
        return [...completedBody.rows, ...older.slice(Math.max(0, completedBody.rows.length - 20))];
      });
      setCursor((current) => current ?? completedBody.nextCursor);
    } catch {
      // keep what is shown; the next change tries again
    }
  }, []);

  // Every server-confirmed change to this customer's chats (new reply,
  // read, Done, reopen) re-reads the lists.
  const version = messages?.version ?? 0;
  useEffect(() => {
    if (firstVersion.current === null) {
      firstVersion.current = version;
      return;
    }
    void refresh();
  }, [version, refresh]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ section: "completed", beforeAt: cursor.at, beforeOrder: cursor.orderNumber });
      const body = await fetchJson<Section>(`/api/account/orders?${params}`);
      setCompleted((current) => {
        const seen = new Set(current.map((row) => row.orderNumber));
        return [...current, ...body.rows.filter((row) => !seen.has(row.orderNumber))];
      });
      setCursor(body.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const { unread, active } = useMemo(() => orderOpenSection(open), [open]);
  const activeRows = [...unread, ...active];

  if (activeRows.length === 0 && completed.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={ShoppingBag}
          title="No orders yet"
          description="When you order, it shows up here together with your chat with BudgetWise."
          action={{ label: "Browse games", href: "/games" }}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="active-orders">
        <h2 id="active-orders" className="text-muted-foreground mb-2.5 text-xs font-bold tracking-wider uppercase">
          Active orders <span className="font-semibold">({activeRows.length})</span>
        </h2>
        {activeRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing in progress right now.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {activeRows.map((order) => (
              <OrderCard key={order.orderNumber} order={order} />
            ))}
          </ul>
        )}
      </section>

      {completed.length > 0 && (
        <section aria-labelledby="completed-orders">
          <h2 id="completed-orders" className="text-muted-foreground mb-2.5 text-xs font-bold tracking-wider uppercase">
            Completed orders
          </h2>
          <ul className="flex flex-col gap-2.5">
            {completed.map((order) => (
              <OrderCard key={order.orderNumber} order={order} />
            ))}
          </ul>
          {cursor && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="border-border hover:bg-muted mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold"
            >
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Show older completed orders
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: MyOrderCard }) {
  const done = order.state === "done";
  const badge = badgeText(order.unreadCount);
  return (
    <li>
      <Link
        href={`/orders/${encodeURIComponent(order.orderNumber)}`}
        data-order-card={order.orderNumber}
        data-state={order.state}
        className={cn(
          "flex items-center gap-3 rounded-2xl border p-3.5 transition-colors",
          done
            ? "border-emerald-500/25 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]"
            : order.unreadCount > 0
              ? "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08]"
              : "surface-premium border-border/60 hover:bg-muted/40",
        )}
      >
        <div className="flex shrink-0 -space-x-3">
          {order.thumbnails.length ? (
            order.thumbnails.slice(0, 2).map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
              <img key={index} src={src} alt="" loading="lazy" className="ring-background size-11 rounded-xl object-cover ring-2" />
            ))
          ) : (
            <span className="bg-muted flex size-11 items-center justify-center rounded-xl">
              <ShoppingBag className="text-muted-foreground size-5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-heading text-sm font-semibold [font-variant-numeric:tabular-nums]">{order.orderNumber}</p>
            {done ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" /> Completed
              </span>
            ) : (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
                In progress
              </span>
            )}
            {badge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                <MessageCircle className="size-3" /> New reply{order.unreadCount > 1 ? ` · ${badge}` : ""}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm">{order.summary}</p>
          <p className="text-muted-foreground truncate text-xs">
            {order.robloxUsername} · {DATE.format(new Date(order.createdAt))}
            {!done && ` · ${formatOrderStatus(order.status)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">{formatPrice(order.totalAmount)}</p>
          <span className="text-primary inline-flex items-center text-xs font-semibold">
            {badge ? "Read" : "Chat"}
            <ChevronRight className="size-3.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}
