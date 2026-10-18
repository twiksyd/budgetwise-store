"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Loader2, MessageCircle, RotateCw, ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { formatOrderStatus } from "@/components/order-chat/order-status-badge";
import { useCustomerMessages, type CustomerConversation } from "@/components/customer-messages/customer-messages-provider";
import { BrandAvatar } from "@/components/brand/brand-avatar";
import {
  customerChatLoader,
  hasSessionCookie,
  loadOlderCompleted,
  loadOrdersSection,
  loginPath,
  useMyOrders,
  warmChat,
  type MyOrderCard,
} from "@/lib/chat/client/customer-store";
import { badgeText, orderOpenSection } from "@/lib/chat/order-summary.mjs";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type { MyOrderCard };

const DATE = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

// How many of the likeliest-next chats are loaded ahead while My Orders is open.
const PREFETCH_CHATS = 3;

/**
 * My Orders for customers with 1 or 50+ orders: orders with a new reply
 * first, then everything still in progress, then completed orders — the
 * completed history loads 20 at a time.
 *
 * Painted from memory when this tab has been here before, then refreshed
 * in the background on every visit. Active orders and completed history
 * are separate requests: active orders never wait for the history. Updates
 * live (new replies, Done, reopened) without a refresh.
 */
export function MyOrdersView() {
  const router = useRouter();
  const messages = useCustomerMessages();
  const { open, completed, openError, completedError } = useMyOrders();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!hasSessionCookie()) {
      router.replace(loginPath());
      return;
    }
    void loadOrdersSection("open");
    void loadOrdersSection("completed");
  }, [router]);

  // Every server-confirmed change to this customer's chats (new reply,
  // read, Done, reopen) re-reads the lists.
  const version = messages?.version ?? 0;
  const seenVersion = useRef(version);
  useEffect(() => {
    if (version === seenVersion.current) return;
    seenVersion.current = version;
    void loadOrdersSection("open");
    void loadOrdersSection("completed");
  }, [version]);

  const { unread, active } = useMemo(() => orderOpenSection(open?.rows ?? []), [open]);
  const activeRows = useMemo(() => [...unread, ...active], [unread, active]);

  // The chats most likely to be opened next are loaded ahead (unread first),
  // so tapping one shows its messages straight away.
  useEffect(() => {
    if (!activeRows.length) return;
    customerChatLoader.prefetchCandidates(activeRows.slice(0, PREFETCH_CHATS).map((row) => row.orderNumber));
  }, [activeRows]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      await loadOlderCompleted();
    } catch {
      // the button stays; tapping again retries
    } finally {
      setLoadingMore(false);
    }
  };

  const completedRows = completed?.rows ?? [];
  const inquiryCard = <InquiryCard inquiry={messages?.inquiry ?? null} />;
  if (open && completed && activeRows.length === 0 && completedRows.length === 0) {
    return (
      <div className="mt-6 space-y-6">
        {inquiryCard}
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
      {inquiryCard}
      <section aria-labelledby="active-orders" aria-busy={!open}>
        <h2 id="active-orders" className="text-muted-foreground mb-2.5 text-xs font-bold tracking-wider uppercase">
          Active orders {open && <span className="font-semibold">({activeRows.length})</span>}
        </h2>
        {!open ? (
          openError ? (
            <LoadError onRetry={() => void loadOrdersSection("open")} />
          ) : (
            <CardSkeletons count={2} />
          )
        ) : activeRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing in progress right now.</p>
        ) : (
          <ul className="flex flex-col gap-2.5" data-testid="active-orders">
            {activeRows.map((order) => (
              <OrderCard key={order.orderNumber} order={order} />
            ))}
          </ul>
        )}
      </section>

      {!completed ? (
        completedError ? (
          <section aria-label="Completed orders">
            <LoadError onRetry={() => void loadOrdersSection("completed")} />
          </section>
        ) : open ? (
          <section aria-label="Completed orders" aria-busy="true">
            <CardSkeletons count={1} />
          </section>
        ) : null
      ) : (
        completedRows.length > 0 && (
          <section aria-labelledby="completed-orders">
            <h2 id="completed-orders" className="text-muted-foreground mb-2.5 text-xs font-bold tracking-wider uppercase">
              Completed orders
            </h2>
            <ul className="flex flex-col gap-2.5">
              {completedRows.map((order) => (
                <OrderCard key={order.orderNumber} order={order} />
              ))}
            </ul>
            {completed.nextCursor && (
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
        )
      )}
    </div>
  );
}

function CardSkeletons({ count }: { count: number }) {
  return (
    <ul className="flex flex-col gap-2.5" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="border-border/60 flex items-center gap-3 rounded-2xl border p-3.5">
          <span className="bg-muted size-11 shrink-0 animate-pulse rounded-xl" />
          <span className="flex-1 space-y-2">
            <span className="bg-muted block h-3.5 w-28 animate-pulse rounded" />
            <span className="bg-muted block h-3 w-44 animate-pulse rounded" />
          </span>
          <span className="bg-muted h-3.5 w-14 animate-pulse rounded" />
        </li>
      ))}
    </ul>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border-border flex items-center justify-between gap-3 rounded-2xl border border-dashed p-3.5 text-sm">
      <span className="text-muted-foreground">Couldn&apos;t load your orders.</span>
      <button
        type="button"
        onClick={onRetry}
        className="border-border hover:bg-muted inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold"
      >
        <RotateCw className="size-3.5" />
        Try again
      </button>
    </div>
  );
}

function OrderCard({ order }: { order: MyOrderCard }) {
  const done = order.state === "done";
  const badge = badgeText(order.unreadCount);
  const warm = () => warmChat(order.orderNumber);
  return (
    <li>
      <Link
        href={`/orders/${encodeURIComponent(order.orderNumber)}`}
        data-order-card={order.orderNumber}
        data-state={order.state}
        onPointerDown={warm}
        onMouseEnter={warm}
        onFocus={warm}
        className={cn(
          "flex items-center gap-3 rounded-2xl border p-3.5 transition-[background-color,transform] duration-100 active:scale-[0.985] motion-reduce:active:scale-100",
          done
            ? "border-emerald-500/25 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] active:bg-emerald-500/[0.12]"
            : order.unreadCount > 0
              ? "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08] active:bg-primary/[0.12]"
              : "surface-premium border-border/60 hover:bg-muted/40 active:bg-muted/70",
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

/**
 * The customer's General Inquiry, pinned above their orders: questions that
 * are not about one order. Opens their one inquiry chat (created on first use).
 */
function InquiryCard({ inquiry }: { inquiry: CustomerConversation | null }) {
  const badge = badgeText(inquiry?.unreadCount ?? 0);
  const href = inquiry ? `/orders/${encodeURIComponent(inquiry.orderNumber)}` : "/messages?to=inquiry";
  const warm = () => inquiry && warmChat(inquiry.orderNumber);
  return (
    <Link
      href={href}
      onPointerDown={warm}
      onMouseEnter={warm}
      onFocus={warm}
      data-testid="inquiry-card"
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3.5 transition-[background-color,transform] duration-100 active:scale-[0.985] motion-reduce:active:scale-100",
        badge
          ? "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08] active:bg-primary/[0.12]"
          : "surface-premium border-border/60 hover:bg-muted/40 active:bg-muted/70",
      )}
    >
      <BrandAvatar className="size-11" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-heading text-sm font-semibold">General Inquiry</p>
          {badge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
              <MessageCircle className="size-3" /> New reply{(inquiry?.unreadCount ?? 0) > 1 ? ` · ${badge}` : ""}
            </span>
          )}
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {inquiry?.lastMessagePreview || "Questions about games, Robux or a future order"}
        </p>
      </div>
      <span className="text-primary inline-flex shrink-0 items-center text-xs font-semibold">
        {badge ? "Read" : "Message us"}
        <ChevronRight className="size-3.5" />
      </span>
    </Link>
  );
}
