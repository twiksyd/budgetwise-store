"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Link2, SearchX, ShieldCheck } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { Composer } from "@/components/chat/composer";
import { ConnectionBadge } from "@/components/chat/connection-badge";
import { GamepassLinkCard, type CustomerSlot } from "@/components/order-chat/gamepass-link-card";
import { OrderSummaryStrip } from "@/components/order-chat/order-summary-strip";
import { formatOrderStatus } from "@/components/order-chat/order-status-badge";
import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";
import { useChatThread } from "@/lib/chat/client/use-chat-thread";
import { useRealtimeChannel } from "@/lib/chat/client/use-realtime-channel";
import {
  cameFrom,
  customerChatCache,
  customerChatLoader,
  readReceipts,
  useOrderMissing,
  type CustomerChatDetails,
} from "@/lib/chat/client/customer-store";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type { CustomerOrderSummaryData } from "@/lib/chat/client/customer-store";

type Cursor = { at: string | null; messageId: string | null };

const MY_ORDERS = "/account/orders";
const EVENTS = ["message", "seen", "fulfillment", "state"] as const;
// Mobile networks drop and recover constantly; only a drop that lasts
// this long is worth telling the customer about.
const CONNECTION_GRACE_MS = 8000;
const NO_CURSOR: Cursor = { at: null, messageId: null };

/**
 * The customer's conversation with BudgetWise about one order, laid out
 * like Messenger: compact header, compact notice, the order pinned as a
 * small summary, then the conversation itself filling the screen, and the
 * composer fixed at the bottom.
 *
 * Data comes from the tab-wide customer cache: a chat opened before paints
 * its messages and summary immediately, and both refresh in parallel in
 * the background. Nothing here waits for realtime.
 */
export function CustomerOrderChat({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const messages = useCustomerMessages();
  const cache = customerChatCache;
  const loader = customerChatLoader;
  const thread = useChatThread({ orderNumber, viewer: "customer", cache, loader });
  const getEntry = useCallback(() => cache.get(orderNumber), [cache, orderNumber]);
  const entry = useSyncExternalStore(cache.subscribe, getEntry, getEntry);
  const details: CustomerChatDetails | null = entry?.details ?? null;
  const summary = details?.summary ?? null;
  const adminRead = details?.adminRead ?? NO_CURSOR;
  const slots = details?.slots ?? [];
  const missing = useOrderMissing(orderNumber);

  // Thread + summary requested at the same time; cached data stays on screen.
  useEffect(() => {
    loader.open(orderNumber);
    return () => {
      if (cache.pinned === orderNumber) cache.pin(null);
    };
  }, [cache, loader, orderNumber]);

  const patchDetails = useCallback(
    (patch: Partial<CustomerChatDetails>) => {
      const current = cache.get(orderNumber)?.details;
      if (current) cache.setDetailsLocal(orderNumber, { ...current, ...patch });
    },
    [cache, orderNumber],
  );
  const reloadDetails = useCallback(() => {
    void loader.ensureDetails(orderNumber, { force: true });
  }, [loader, orderNumber]);

  // The read position the thread opens at: captured once, when first known.
  const ownRead = useRef<Cursor | null>(null);
  if (!ownRead.current && details) ownRead.current = details.ownRead;

  const { fetchNewer } = thread;
  const status = useRealtimeChannel({
    topic: summary?.conversationId ? `chat:${summary.conversationId}` : null,
    events: EVENTS,
    onEvent: (event, payload) => {
      if (event === "message") void fetchNewer();
      if (event === "seen") {
        patchDetails({
          adminRead: {
            at: (payload.admin_read_at as string | null) ?? null,
            messageId: (payload.admin_read_message_id as string | null) ?? null,
          },
        });
      }
      // The events only say "it changed"; what is shown always comes from the server.
      if (event === "fulfillment" || event === "state") reloadDetails();
    },
    onResync: () => {
      void fetchNewer();
      reloadDetails();
    },
  });

  // No conversation yet (nothing to subscribe to): the account-wide topic
  // still says when something changed for this customer.
  const version = messages?.version ?? 0;
  const seenVersion = useRef(version);
  useEffect(() => {
    if (version === seenVersion.current) return;
    seenVersion.current = version;
    if (!summary?.conversationId) {
      reloadDetails();
      void fetchNewer();
    }
  }, [version, summary?.conversationId, reloadDetails, fetchNewer]);

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
      // Already recorded (or on its way) from an earlier visit: nothing to send.
      if (readReceipts.get(orderNumber) === messageId) return;
      if (cache.get(orderNumber)?.details?.ownRead.messageId === messageId) return;
      readReceipts.set(orderNumber, messageId);
      // Fire-and-forget: never blocks scrolling or leaving the chat.
      void markRead(messageId).then((result) => {
        if (result === "failed" && readReceipts.get(orderNumber) === messageId) readReceipts.delete(orderNumber);
        if (result !== "ok") return;
        patchDetails({ ownRead: { at: new Date().toISOString(), messageId } });
        // Badges everywhere (floating button, My Orders) re-read the
        // server's count — never a client-side guess.
        refreshBadges?.();
      });
    },
    [cache, orderNumber, markRead, refreshBadges, patchDetails],
  );

  const slip = useMemo(
    () => ({
      orderNumber,
      robloxUsername: summary?.robloxUsername ?? null,
      total: summary?.totalAmount ?? null,
    }),
    [orderNumber, summary?.robloxUsername, summary?.totalAmount],
  );

  // Back: straight back to the My Orders screen this chat was opened from
  // (instant, from memory); otherwise forward to My Orders.
  const goBack = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (cameFrom() === MY_ORDERS) router.back();
    else router.push(MY_ORDERS);
  };

  const welcome = useWelcome(orderNumber, messages?.signedIn ? messages.conversations.length : null);

  const completed = summary?.state === "done";
  const statusText = completed ? "Completed" : summary ? formatOrderStatus(summary.status) : "";

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <header className="border-border/60 bg-background/95 sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur sm:px-3">
        <Link
          href={MY_ORDERS}
          onClick={goBack}
          className="hover:bg-muted active:bg-muted inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-75"
          aria-label="Back to My Orders"
          data-testid="chat-back"
        >
          <ArrowLeft className="size-5" />
        </Link>
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
      </header>

      {missing && !summary ? (
        <OrderUnavailable />
      ) : (
        <>
          {summary && <OrderNotice completed={completed} paymentSent={paymentSent} />}

          {summary && summary.lines.length > 0 && (
            <OrderSummaryStrip lines={summary.lines} itemCount={summary.itemCount} total={summary.totalAmount} />
          )}

          {slots.length > 0 && (
            <GamepassSection orderNumber={orderNumber} slots={slots} onSlotsChange={(next) => patchDetails({ slots: next })} />
          )}

          {welcome.show && <WelcomeCard onDismiss={welcome.dismiss} />}

          <ChatThread
            state={thread.state}
            orderNumber={orderNumber}
            slip={slip}
            isOwnSide={isOwnSide}
            isMine={isOwnSide}
            senderLabelFor={senderLabelFor}
            otherSideReadCursor={adminRead}
            initialReadCursor={ownRead.current ?? NO_CURSOR}
            onLoadOlder={() => void thread.loadOlder()}
            loadError={thread.loadError}
            onReload={() => void thread.reload()}
            onRetry={thread.retry}
            onDiscard={thread.discard}
            onReadUpTo={onReadUpTo}
            emptyState={<p className="text-muted-foreground py-10 text-center text-sm">Say hi to BudgetWise!</p>}
          />

          <Composer placeholder="Type a message…" onSendText={thread.sendText} onSendImages={thread.sendAlbum} />
        </>
      )}
    </div>
  );
}

function OrderUnavailable() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <SearchX className="text-muted-foreground size-10" />
      <p className="font-heading text-base font-semibold">We couldn&apos;t find this order</p>
      <p className="text-muted-foreground max-w-xs text-sm">It may belong to a different account. Your orders are all in My Orders.</p>
      <Link href={MY_ORDERS} className="bg-primary text-primary-foreground mt-1 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
        Go to My Orders
      </Link>
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

/**
 * First order only, right after checkout (?placed=1): what happens next, in
 * two lines. Dismissed for good.
 */
function useWelcome(orderNumber: string, orderCount: number | null) {
  const [placed, setPlaced] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setPlaced(new URLSearchParams(window.location.search).has("placed"));
    try {
      if (localStorage.getItem(WELCOME_KEY(orderNumber))) setHidden(true);
    } catch {
      // storage blocked: show it this time
    }
  }, [orderNumber]);
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
  return { show: placed && !hidden && orderCount !== null && orderCount <= 1, dismiss };
}

function WelcomeCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="border-primary/15 bg-primary/5 mx-3 mt-3 rounded-2xl border p-3.5 sm:mx-4" role="status">
      <p className="font-heading text-base font-semibold">Order placed!</p>
      <p className="mt-1 text-sm leading-relaxed">
        BudgetWise will message you <strong>here</strong> once your order is reviewed.
      </p>
      <p className="text-muted-foreground mt-1 text-xs">You can come back to this chat anytime from My Orders.</p>
      <button
        type="button"
        onClick={onDismiss}
        className="bg-primary text-primary-foreground mt-2.5 inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold"
      >
        Got it
      </button>
    </div>
  );
}
