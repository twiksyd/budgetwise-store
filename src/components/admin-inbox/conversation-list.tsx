"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Eye, Gamepad2, Loader2, Search } from "lucide-react";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import { ConnectionBadge } from "@/components/chat/connection-badge";
import { StaffAvatar, StaffAvatarGroup, staffName } from "@/components/admin-inbox/staff-avatar";
import { CustomerAvatar } from "@/components/admin-inbox/customer-avatar";
import { GameFilter } from "@/components/admin-inbox/game-filter";
import { attentionState, isNewAttention, repliedBy, type AttentionState } from "@/lib/chat/inbox-attention.mjs";
import { formatOrderStatus } from "@/components/order-chat/order-status-badge";
import { isPaymentReceived, visibleRows, type InboxFilter, type InboxRow } from "@/lib/chat/inbox-state.mjs";
import { describeConversationPresence } from "@/lib/chat/presence-state.mjs";
import { formatPrice } from "@/lib/pricing";
import { isInquiryKey } from "@/lib/order-chat.mjs";
import { cn } from "@/lib/utils";

// Active is the working queue; Done is the archive of handled chats.
const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "needs_reply", label: "Needs reply" },
  { value: "unopened", label: "Unopened" },
  { value: "seen_no_reply", label: "Seen, no reply" },
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

export function ConversationList() {
  const { inbox, view, setView, status, loadingPage, loadMore, activeOrderNumber, loader, outsideNeedsReply } = useInbox();
  const gameFiltered = Array.isArray(view.games);
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
          <h1 className="font-heading shrink-0 text-base font-semibold whitespace-nowrap">Order Chats</h1>
          <div className="flex items-center gap-2">
            <GameFilter />
            <ConnectionBadge status={status} />
          </div>
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
        {/* The game filter never hides urgent chats silently (0029). */}
        {gameFiltered && outsideNeedsReply > 0 && (
          <button
            type="button"
            onClick={() => setView({ ...view, filter: "needs_reply", games: null, includeInquiries: true })}
            className="border-primary/25 bg-primary/5 text-primary flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs font-medium"
            data-testid="outside-needs-reply"
          >
            <span>
              {outsideNeedsReply} {outsideNeedsReply === 1 ? "chat needs" : "chats need"} a reply in other games
            </span>
            <span className="shrink-0 font-semibold underline">Show</span>
          </button>
        )}
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

// A row whose customer activity arrived this recently pulses once when it
// first renders as New (a live arrival, not an old chat met on a filter
// switch). Keyed by that message, so the same arrival never pulses twice.
const NEW_PULSE_WINDOW_MS = 60_000;
const pulsedArrivals = new Set<string>();

function useArrivalPulse(row: InboxRow, isNew: boolean) {
  const key = row.lastCustomerMessageId;
  const [pulse] = useState(() => {
    if (!isNew || !key || pulsedArrivals.has(key)) return false;
    const at = row.lastCustomerMessageAt ? Date.parse(row.lastCustomerMessageAt) : NaN;
    return Date.now() - at < NEW_PULSE_WINDOW_MS;
  });
  useEffect(() => {
    if (pulse && key) pulsedArrivals.add(key);
  }, [pulse, key]);
  // Acknowledged (viewed or answered) mid-pulse: stop.
  return pulse && isNew;
}

function newLabel(row: InboxRow, isInquiry: boolean) {
  // 0033: a new order also arrives in the customer's conversation.
  if (row.lastMessageKind === "slip" && row.lastCustomerMessageId === row.lastMessageId) return "New order";
  return isInquiry ? "New inquiry" : "New";
}

// Whole-row background per shared attention state (0030). Unopened is the
// brightest; once any admin has read it the row turns a clearly darker gray
// for everyone (amber chip: still needs a reply); Replied is a lighter
// neutral gray; Done is the most muted. Text labels carry the meaning too.
const ROW_TONE: Record<AttentionState, string> = {
  // Dark mode keeps the same order: Unopened is the raised, brightest row;
  // Seen steps down, Replied further, Done sits on the page background.
  unopened: "bg-background hover:bg-rose-500/[0.04] dark:bg-zinc-800/80 dark:hover:bg-zinc-800",
  seen: "bg-zinc-200/80 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-900/80",
  replied: "bg-zinc-100/80 hover:bg-zinc-100 dark:bg-zinc-900/45 dark:hover:bg-zinc-900/60",
  done: "bg-zinc-50 hover:bg-zinc-100/70 dark:bg-transparent dark:hover:bg-zinc-900/40",
  quiet: "bg-background hover:bg-muted/50",
};

function ConversationRow({ row }: { row: InboxRow }) {
  const { me, directory, presence, nowMs, activeOrderNumber, select, loader } = useInbox();
  const active = activeOrderNumber === row.orderNumber;
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const unread = row.unreadCount > 0;
  const activity = describeConversationPresence(presence, row.orderNumber, { me, directory, nowMs });
  const isInquiry = isInquiryKey(row.orderNumber);
  // 0033: one row per customer — their conversation carries every order.
  const orderCount = isInquiry ? (row.orderCount ?? 0) : 1;
  const conversationWithOrders = isInquiry && orderCount > 0;
  const state = attentionState(row);
  const isNew = isNewAttention(row);
  const replier = repliedBy(row);
  const viewers = state === "seen" ? (row.viewedBy ?? []) : [];
  const pulse = useArrivalPulse(row, isNew);
  const nameOf = (id: string) => (id === me ? "you" : staffName(directory[id], "another admin"));
  const strong = state === "unopened" || unread;

  return (
    <li>
      <a
        href={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}
        data-order-number={row.orderNumber}
        data-attention={state}
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
          "border-border/50 relative flex gap-3 border-b px-3 py-3 transition-colors duration-300",
          ROW_TONE[state],
          // The open chat keeps its state colour; selection is a ring.
          active && "ring-primary/60 ring-2 ring-inset",
          pulse && "bw-arrival-pulse",
        )}
      >
        {state === "unopened" && (
          <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-rose-500 dark:bg-rose-400" />
        )}
        <CustomerAvatar name={row.buyerName} seed={row.avatarSeed} photoUrl={row.avatarPhotoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate text-sm", strong ? "font-bold" : state === "seen" ? "font-semibold" : "font-medium")}>
              {row.buyerName}
            </p>
            <time
              className={cn("shrink-0 text-[11px]", strong ? "text-foreground font-semibold" : "text-muted-foreground")}
              dateTime={row.lastMessageAt}
              suppressHydrationWarning
            >
              {listTime(row.lastMessageAt, nowMs)}
            </time>
          </div>
          <p className="text-muted-foreground truncate text-[11px] font-medium">
            {conversationWithOrders ? (
              <span data-testid="conversation-orders">
                {row.buyerRobloxUsername ? <span className="text-foreground/80">@{row.buyerRobloxUsername} · </span> : null}
                <span className="bg-primary/10 text-primary rounded-full px-1.5 py-px font-semibold">
                  {orderCount} order{orderCount === 1 ? "" : "s"}
                </span>{" "}
                · {row.latestOrderNumber} · {formatPrice(row.totalAmount)} · {formatOrderStatus(row.orderStatus ?? "pending")}
              </span>
            ) : isInquiry ? (
              <span className="bg-primary/10 text-primary rounded-full px-1.5 py-px font-semibold" data-testid="inquiry-label">
                General Inquiry
              </span>
            ) : (
              <>
                {row.buyerRobloxUsername ? <span className="text-foreground/80">@{row.buyerRobloxUsername} · </span> : null}
                {row.orderNumber} · {formatPrice(row.totalAmount)} · {formatOrderStatus(row.orderStatus ?? "pending")}
              </>
            )}
          </p>
          {(!isInquiry || conversationWithOrders) && row.gameNames.length > 0 && (
            <p className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-[11px]" data-testid="row-games">
              <Gamepad2 className="size-3 shrink-0" aria-hidden />
              <span className="truncate">
                {row.gameNames[0]}
                {row.gameNames.length > 1 ? ` +${row.gameNames.length - 1}` : ""}
              </span>
            </p>
          )}
          {activity.text ? (
            <p className="text-primary mt-0.5 truncate text-xs font-semibold">{activity.text}</p>
          ) : (
            <p className={cn("mt-0.5 truncate text-xs", strong ? "text-foreground font-semibold" : "text-muted-foreground")}>
              {row.lastSenderRole === "admin" ? "BudgetWise: " : ""}
              {row.lastMessagePreview}
            </p>
          )}
          {(row.historyUnreadCount ?? 0) > 0 && <p className="text-primary mt-1 text-[11px] font-medium">{row.historyUnreadCount} unread in historical orders</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1" data-testid="row-status">
            {state === "unopened" ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-500/10 px-1.5 py-px text-[10px] font-semibold text-rose-700 dark:border-rose-400/40 dark:text-rose-300"
                data-testid="unopened-indicator"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
                Unopened{isNew ? ` · ${newLabel(row, isInquiry)}` : ""}
              </span>
            ) : state === "seen" ? (
              <>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-400/20 px-1.5 py-px text-[10px] font-semibold text-amber-800 dark:border-amber-400/40 dark:text-amber-200"
                  data-testid="seen-indicator"
                >
                  <Eye className="size-3" aria-hidden />
                  Seen · No reply
                </span>
                <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]" data-testid="viewed-indicator">
                  <StaffAvatarGroup entries={viewers.map((id) => directory[id])} />
                  Viewed by {viewers.map(nameOf).join(", ")}
                </span>
              </>
            ) : replier && state !== "quiet" ? (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px] font-medium" data-testid="replied-indicator">
                <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
                Replied by {nameOf(replier)}
              </span>
            ) : null}
            {row.state === "done" && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Done
              </span>
            )}
            {isPaymentReceived(row) && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-emerald-600/30 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300"
                data-testid="paid-indicator"
                title="Payment Received (confirmed by an admin)"
              >
                <Check className="size-3" aria-hidden strokeWidth={3} />
                Paid
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5">
              {row.assignedAdminId ? (
                <span
                  className="bg-background/70 text-muted-foreground inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-0.5 text-[10px] font-semibold"
                  title="Assigned to"
                  data-testid="assignee"
                >
                  <StaffAvatar entry={directory[row.assignedAdminId]} size="xs" className="ring-0" />
                  {row.assignedAdminId === me ? "You" : staffName(directory[row.assignedAdminId], "Another admin")}
                </span>
              ) : (
                <span className="text-muted-foreground border-border rounded-full border border-dashed px-2 py-0.5 text-[10px] font-semibold">
                  Unassigned
                </span>
              )}
              {/* My own unread count: personal, independent of the shared state. */}
              {unread && (
                <span
                  className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  aria-label={`${row.unreadCount} unread by you`}
                  title="Unread by you"
                >
                  {row.unreadCount}
                </span>
              )}
            </span>
          </div>
        </div>
      </a>
    </li>
  );
}
