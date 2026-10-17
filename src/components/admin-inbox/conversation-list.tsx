"use client";

import { useCallback, useEffect, useRef } from "react";
import { Loader2, Search } from "lucide-react";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import { ConnectionBadge } from "@/components/chat/connection-badge";
import { formatOrderStatus } from "@/components/order-chat/order-status-badge";
import { visibleRows, type InboxFilter, type InboxRow } from "@/lib/chat/inbox-state.mjs";
import { describeConversationPresence } from "@/lib/chat/presence-state.mjs";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Active is the working queue; Done is the archive of handled chats.
const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "unread", label: "Unread" },
  { value: "mine", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

/** Rows after the open one that are prefetched (thread page + details). */
const PREFETCH_NEXT = 4;
const HOVER_PREFETCH_DELAY_MS = 60;

const SHORT_TIME = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const SHORT_DATE = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });

function listTime(iso: string, nowMs: number) {
  const date = new Date(iso);
  return DAY.format(date) === DAY.format(new Date(nowMs)) ? SHORT_TIME.format(date) : SHORT_DATE.format(date);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function ConversationList() {
  const { inbox, view, setView, status, loadingPage, loadMore, activeOrderNumber, loader } = useInbox();
  const rows = visibleRows(inbox);

  // Likely next conversations: the few rows below the open one (or the top
  // of the list). Throttled — a steady stream of messages reordering the
  // list must not keep postponing it — and never more than a handful.
  const order = rows.map((row) => row.orderNumber).join(",");
  const latest = useRef({ order, activeOrderNumber });
  latest.current = { order, activeOrderNumber };
  const prefetchTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prefetchTimer.current !== undefined) return; // one already scheduled uses the latest list
    prefetchTimer.current = window.setTimeout(() => {
      prefetchTimer.current = undefined;
      const { order: current, activeOrderNumber: open } = latest.current;
      const list = current ? current.split(",") : [];
      const index = open ? list.indexOf(open) : -1;
      loader.prefetchCandidates(index >= 0 ? list.slice(index + 1, index + 1 + PREFETCH_NEXT) : list.slice(0, PREFETCH_NEXT + 1));
    }, 300);
  }, [order, activeOrderNumber, loader]);
  useEffect(() => () => window.clearTimeout(prefetchTimer.current), []);

  // Up/Down move between conversations (focus only — Enter opens one).
  const onListKeyDown = useCallback((event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[data-order-number]")];
    if (!links.length) return;
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = links.length - 1;
    else if (current < 0) next = 0;
    else next = Math.min(links.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
    event.preventDefault();
    links[next].focus();
    links[next].scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border/60 space-y-2.5 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-heading text-base font-semibold">Order Chats</h1>
          <ConnectionBadge status={status} />
        </div>
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            type="search"
            value={view.search}
            onChange={(event) => setView({ ...view, search: event.target.value })}
            placeholder="Name, order number, Roblox username"
            className="border-input bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/40 h-10 w-full rounded-xl border pr-3 pl-9 text-sm outline-none focus-visible:ring-3"
          />
        </label>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Filter chats">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={view.filter === filter.value}
              onClick={() => setView({ ...view, filter: filter.value })}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                view.filter === filter.value
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingPage && rows.length === 0 ? (
          <div className="text-muted-foreground flex justify-center p-8">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            {view.search
              ? "No chats match."
              : view.filter === "active"
                ? "Nothing waiting. New chats appear here automatically."
                : view.filter === "done"
                  ? "No chats marked Done yet."
                  : "No chats match."}
          </p>
        ) : (
          <ul onKeyDown={onListKeyDown} aria-label="Conversations">
            {rows.map((row) => (
              <ConversationRow key={row.orderNumber} row={row} />
            ))}
          </ul>
        )}
        {inbox.hasMore && (
          <div className="p-3">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingPage}
              className="border-border hover:bg-muted w-full rounded-xl border py-2 text-xs font-semibold"
            >
              {loadingPage ? "Loading…" : "Load older chats"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ row }: { row: InboxRow }) {
  const { me, directory, presence, nowMs, activeOrderNumber, select, loader } = useInbox();
  const active = activeOrderNumber === row.orderNumber;
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const unread = row.unreadCount > 0;
  const activity = describeConversationPresence(presence, row.orderNumber, { me, directory, nowMs });
  const assignee = row.assignedAdminId
    ? row.assignedAdminId === me
      ? "You"
      : (directory[row.assignedAdminId]?.displayName ?? "Another admin")
    : null;

  return (
    <li>
      <a
        href={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}
        data-order-number={row.orderNumber}
        onClick={(event) => {
          // New tab / window keeps the browser's behaviour.
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          select(row.orderNumber, { focusComposer: true });
        }}
        onMouseEnter={() => {
          window.clearTimeout(hoverTimer.current);
          hoverTimer.current = window.setTimeout(() => loader.prefetchNow(row.orderNumber), HOVER_PREFETCH_DELAY_MS);
        }}
        onMouseLeave={() => window.clearTimeout(hoverTimer.current)}
        onFocus={() => loader.prefetchNow(row.orderNumber)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "border-border/40 flex gap-3 border-b px-3 py-3 transition-colors",
          active ? "bg-primary/8" : "hover:bg-muted/50",
        )}
      >
        <div className="bg-primary/10 text-primary relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
          {initials(row.buyerName)}
          {unread && <span className="bg-primary ring-background absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate text-sm", unread ? "font-bold" : "font-semibold")}>{row.buyerName}</p>
            <time className="text-muted-foreground shrink-0 text-[11px]" dateTime={row.lastMessageAt} suppressHydrationWarning>
              {listTime(row.lastMessageAt, nowMs)}
            </time>
          </div>
          <p className="text-muted-foreground truncate text-[11px] font-medium">
            {row.orderNumber} · {formatPrice(row.totalAmount)} · {formatOrderStatus(row.orderStatus ?? "pending")}
          </p>
          {activity.text ? (
            <p className="text-primary mt-0.5 truncate text-xs font-semibold">{activity.text}</p>
          ) : (
            <p className={cn("mt-0.5 truncate text-xs", unread ? "text-foreground font-semibold" : "text-muted-foreground")}>
              {row.lastSenderRole === "admin" ? "BudgetWise: " : ""}
              {row.lastMessagePreview}
            </p>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {row.state === "done" && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Done
              </span>
            )}
            {assignee ? (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold">
                {assignee}
              </span>
            ) : (
              <span className="rounded-full border border-dashed px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Unassigned
              </span>
            )}
            {unread && (
              <span className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                {row.unreadCount}
              </span>
            )}
          </div>
        </div>
      </a>
    </li>
  );
}
