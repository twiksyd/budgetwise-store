"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Link2, ShieldCheck, X } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { Composer } from "@/components/chat/composer";
import { ConnectionBadge } from "@/components/chat/connection-badge";
import { GamepassLinkCard, type CustomerSlot } from "@/components/order-chat/gamepass-link-card";
import { OrderSummaryStrip } from "@/components/order-chat/order-summary-strip";
import { formatOrderStatus } from "@/components/order-chat/order-status-badge";
import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";
import { useChatThread } from "@/lib/chat/client/use-chat-thread";
import { useRealtimeChannel } from "@/lib/chat/client/use-realtime-channel";
import { fetchJson } from "@/lib/chat/client/fetch-json";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import type { SummaryLine } from "@/lib/chat/order-summary.mjs";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Cursor = { at: string | null; messageId: string | null };

export interface CustomerOrderSummaryData {
  orderNumber: string;
  conversationId: string | null;
  totalAmount: number;
  createdAt: string;
  buyerName: string;
  robloxUsername: string;
  status: string;
  state: "active" | "done";
  paymentSent: boolean;
  itemCount: number;
  summary: string;
  lines: SummaryLine[];
}

export interface CustomerConversationInitial {
  summary: CustomerOrderSummaryData;
  messages: ChatMessageDto[];
  hasOlder: boolean;
  adminRead: Cursor;
  ownRead: Cursor;
  slots: CustomerSlot[];
}

const EVENTS = ["message", "seen", "fulfillment", "state"] as const;
// Mobile networks drop and recover constantly; only a drop that lasts
// this long is worth telling the customer about.
const CONNECTION_GRACE_MS = 4000;

/**
 * The customer's conversation with BudgetWise about one order, laid out
 * like Messenger: compact header, compact notice, the order pinned as a
 * small summary, then the conversation itself filling the screen, and the
 * composer fixed at the bottom. Used full-screen on the order page and
 * inside the floating messenger panel.
 */
export function CustomerOrderChat({
  orderNumber,
  variant,
  initial,
  welcome = false,
  onClose,
  headerAction,
}: {
  orderNumber: string;
  variant: "page" | "sheet";
  initial?: CustomerConversationInitial;
  welcome?: boolean;
  onClose?: () => void;
  headerAction?: React.ReactNode;
}) {
  const messages = useCustomerMessages();
  const thread = useChatThread({
    orderNumber,
    viewer: "customer",
    initialMessages: initial?.messages,
    initialHasOlder: initial?.hasOlder,
  });
  const [summary, setSummary] = useState<CustomerOrderSummaryData | null>(initial?.summary ?? null);
  const [adminRead, setAdminRead] = useState<Cursor>(initial?.adminRead ?? { at: null, messageId: null });
  const [slots, setSlots] = useState<CustomerSlot[]>(initial?.slots ?? []);
  const ownRead = useRef<Cursor>(initial?.ownRead ?? { at: null, messageId: null });

  const loadSummary = useCallback(async () => {
    try {
      const body = await fetchJson<{
        summary: CustomerOrderSummaryData;
        adminRead: Cursor;
        ownRead: Cursor;
        slots: CustomerSlot[];
      }>(`/api/order-chat/${encodeURIComponent(orderNumber)}/summary`);
      setSummary(body.summary);
      setAdminRead(body.adminRead);
      setSlots(body.slots);
      if (!ownRead.current.messageId) ownRead.current = body.ownRead;
    } catch {
      // keep what is on screen; the next event or resync tries again
    }
  }, [orderNumber]);

  useEffect(() => {
    if (!initial) void loadSummary();
  }, [initial, loadSummary]);

  const refreshSlots = useCallback(() => {
    void fetchJson<{ slots: CustomerSlot[] }>(`/api/order-chat/${encodeURIComponent(orderNumber)}/fulfillment`)
      .then((body) => setSlots(body.slots))
      .catch(() => undefined);
  }, [orderNumber]);

  const { fetchNewer } = thread;
  const status = useRealtimeChannel({
    topic: summary?.conversationId ? `chat:${summary.conversationId}` : null,
    events: EVENTS,
    onEvent: (event, payload) => {
      if (event === "message") void fetchNewer();
      if (event === "seen") {
        setAdminRead({
          at: (payload.admin_read_at as string | null) ?? null,
          messageId: (payload.admin_read_message_id as string | null) ?? null,
        });
      }
      if (event === "fulfillment") refreshSlots();
      if (event === "state" && (payload.state === "active" || payload.state === "done")) {
        setSummary((current) => (current ? { ...current, state: payload.state as "active" | "done" } : current));
      }
    },
    onResync: () => {
      void fetchNewer();
      void loadSummary();
    },
  });

  const paymentSent = useMemo(
    () => Boolean(summary?.paymentSent) || thread.state.messages.some((message) => message.kind === "payment"),
    [summary?.paymentSent, thread.state.messages],
  );

  const isOwnSide = useCallback((message: ChatMessageDto) => message.senderRole === "customer", []);
  const senderLabelFor = useCallback(
    (message: ChatMessageDto) => (message.senderRole === "admin" ? "BudgetWise" : null),
    [],
  );
  const { markRead } = thread;
  const refreshBadges = messages?.refresh;
  const onReadUpTo = useCallback(
    (messageId: string) => {
      void markRead(messageId).then((result) => {
        // Badges everywhere (floating button, My Orders) re-read the
        // server's count — never a client-side guess.
        if (result === "ok") refreshBadges?.();
      });
    },
    [markRead, refreshBadges],
  );

  const slip = useMemo(
    () => ({
      orderNumber,
      robloxUsername: summary?.robloxUsername ?? null,
      total: summary?.totalAmount ?? null,
    }),
    [orderNumber, summary?.robloxUsername, summary?.totalAmount],
  );

  const completed = summary?.state === "done";
  const statusText = completed ? "Completed" : summary ? formatOrderStatus(summary.status) : "";

  return (
    <div className="bg-background flex h-full min-h-0 flex-col" data-variant={variant}>
      <header className="border-border/60 bg-background/95 sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur sm:px-3">
        {variant === "page" ? (
          <Link
            href="/account/orders"
            className="hover:bg-muted inline-flex size-11 shrink-0 items-center justify-center rounded-full"
            aria-label="Back to My Orders"
          >
            <ArrowLeft className="size-5" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted inline-flex size-11 shrink-0 items-center justify-center rounded-full"
            aria-label="Close messages"
          >
            <X className="size-5" />
          </button>
        )}
        <div className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
          BW
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm leading-tight font-bold">
            BudgetWise
            <ConnectionBadge status={status} graceMs={CONNECTION_GRACE_MS} className="text-[11px] font-normal" />
          </p>
          <p className="text-muted-foreground truncate text-xs leading-tight">
            Order <span className="[font-variant-numeric:tabular-nums]">{orderNumber}</span>
            {statusText && (
              <>
                {" · "}
                <span className={cn(completed && "font-semibold text-emerald-700 dark:text-emerald-300")}>
                  {statusText}
                  {completed && " ✓"}
                </span>
              </>
            )}
            {summary && ` · ${formatPrice(summary.totalAmount)}`}
          </p>
        </div>
        {headerAction}
        {variant === "sheet" && (
          <Link
            href={`/orders/${encodeURIComponent(orderNumber)}`}
            onClick={onClose}
            className="text-primary hidden shrink-0 px-1 text-xs font-semibold min-[380px]:inline"
          >
            View full order
          </Link>
        )}
      </header>

      <OrderNotice completed={completed} paymentSent={paymentSent} />

      {summary && summary.lines.length > 0 && (
        <OrderSummaryStrip lines={summary.lines} itemCount={summary.itemCount} total={summary.totalAmount} />
      )}

      {slots.length > 0 && <GamepassSection orderNumber={orderNumber} slots={slots} onSlotsChange={setSlots} />}

      {welcome && <WelcomeCard orderNumber={orderNumber} />}

      <ChatThread
        state={thread.state}
        orderNumber={orderNumber}
        slip={slip}
        isOwnSide={isOwnSide}
        isMine={isOwnSide}
        senderLabelFor={senderLabelFor}
        otherSideReadCursor={adminRead}
        initialReadCursor={ownRead.current}
        onLoadOlder={() => void thread.loadOlder()}
        loadError={thread.loadError}
        onReload={() => void thread.reload()}
        onRetry={thread.retry}
        onDiscard={thread.discard}
        onReadUpTo={onReadUpTo}
        emptyState={<p className="text-muted-foreground py-10 text-center text-sm">Say hi to BudgetWise!</p>}
      />

      <Composer
        placeholder="Type a message…"
        onSendText={thread.sendText}
        onSendImages={thread.sendAlbum}
      />
    </div>
  );
}

/** One compact line, chosen from structured state only (never chat text). */
function OrderNotice({ completed, paymentSent }: { completed: boolean; paymentSent: boolean }) {
  if (completed) {
    return (
      <p className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-900 sm:px-4 dark:text-emerald-100">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        Completed ✓ — this order is finished. Message us here anytime.
      </p>
    );
  }
  if (paymentSent) {
    return (
      <p className="border-primary/15 bg-primary/5 flex items-center gap-2 border-b px-3 py-2 text-xs font-medium sm:px-4">
        <CheckCircle2 className="text-primary size-4 shrink-0" />
        Pay using the payment card below, then send your receipt here.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-950 sm:px-4 dark:text-amber-100">
      <ShieldCheck className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
      Wait for BudgetWise&apos;s official payment instructions before sending payment.
    </p>
  );
}

/** Gamepass links: open while any are missing; a single line once all are in. */
function GamepassSection({
  orderNumber,
  slots,
  onSlotsChange,
}: {
  orderNumber: string;
  slots: CustomerSlot[];
  onSlotsChange: (slots: CustomerSlot[]) => void;
}) {
  const waiting = slots.filter((slot) => slot.status === "waiting").length;
  const [open, setOpen] = useState(waiting > 0);
  const label =
    waiting > 0
      ? `Gamepass link${slots.length > 1 ? "s" : ""} needed (${slots.length - waiting} of ${slots.length} added)`
      : `Gamepass link${slots.length > 1 ? "s" : ""} submitted ✓`;
  return (
    <section className="border-border/60 border-b" aria-label="Gamepass links">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold sm:px-4"
      >
        <Link2 className={cn("size-4", waiting > 0 ? "text-amber-600" : "text-emerald-600")} />
        <span className="flex-1">{label}</span>
        <span className="text-primary inline-flex items-center gap-0.5">
          {open ? "Hide" : waiting > 0 ? "Add" : "View"}
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </span>
      </button>
      {open && (
        <div className="max-h-[45vh] overflow-y-auto overscroll-contain px-3 pb-3 sm:px-4">
          <GamepassLinkCard orderNumber={orderNumber} slots={slots} onSlotsChange={onSlotsChange} />
        </div>
      )}
    </section>
  );
}

const WELCOME_KEY = (orderNumber: string) => `bw:welcome-seen:${orderNumber}`;

/** First order only: what happens next, in two lines. Dismissed for good. */
function WelcomeCard({ orderNumber }: { orderNumber: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_KEY(orderNumber))) setHidden(true);
    } catch {
      // storage blocked: show it this time
    }
  }, [orderNumber]);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(WELCOME_KEY(orderNumber), "1");
    } catch {
      // ignore
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has("placed")) {
      url.searchParams.delete("placed");
      window.history.replaceState(window.history.state, "", url);
    }
  };
  return (
    <div className="border-primary/15 bg-primary/5 mx-3 mt-3 rounded-2xl border p-3.5 sm:mx-4" role="status">
      <p className="font-heading text-base font-semibold">Order placed!</p>
      <p className="mt-1 text-sm leading-relaxed">
        BudgetWise will message you <strong>here</strong> once your order is reviewed.
      </p>
      <p className="text-muted-foreground mt-1 text-xs">You can come back to this chat anytime from My Orders.</p>
      <button
        type="button"
        onClick={dismiss}
        className="bg-primary text-primary-foreground mt-2.5 inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold"
      >
        Got it
      </button>
    </div>
  );
}
