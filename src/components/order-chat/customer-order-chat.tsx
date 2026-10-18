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
  chatBackReturns,
  customerChatCache,
  customerChatLoader,
  readReceipts,
  useOrderMissing,
  type ConversationOrder,
  type CustomerChatDetails,
} from "@/lib/chat/client/customer-store";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import { assistantLine, currentAssistant } from "@/lib/chat/assistant.mjs";
import { reactionsFromEvent } from "@/lib/chat/message-meta.mjs";
import { useMessageFeatures } from "@/lib/chat/client/use-message-features";
import { useTypingIndicator, useTypingSender } from "@/lib/chat/client/use-typing";
import { jsonInit } from "@/lib/chat/client/fetch-json";
import { MessageActionsContext } from "@/components/chat/message-actions";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import type { ReplyQuote } from "@/lib/chat/dto.mjs";
import { latestPaymentReceived, paymentMessageToRefresh } from "@/lib/chat/payment-received.mjs";
import { isInquiryKey } from "@/lib/order-chat.mjs";
import { BrandAvatar } from "@/components/brand/brand-avatar";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type { CustomerOrderSummaryData } from "@/lib/chat/client/customer-store";

type Cursor = { at: string | null; messageId: string | null };

const MY_ORDERS = "/account/orders";
// "assistant": the assignment changed (migration 0025); the payload is empty.
// "payment": an admin confirmed a payment (0027); the payload is empty too.
// "typing" / "reaction" (0032): an admin is composing (public username only);
// a message's reactions changed (counts + my own, no admin ids).
const EVENTS = ["message", "seen", "fulfillment", "state", "assistant", "payment", "typing", "reaction"] as const;
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
  // 0033: this order lives in the customer's conversation — open it there,
  // at this order (replace: Back skips the hop).
  const movedTo = details?.movedTo ?? null;
  useEffect(() => {
    if (movedTo) router.replace(`/orders/${encodeURIComponent(movedTo)}?focus=${encodeURIComponent(orderNumber)}`);
  }, [movedTo, orderNumber, router]);
  const conversationOrders: ConversationOrder[] = details?.orders ?? [];

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

  const { fetchNewer, patchMessage } = thread;
  const typingIndicator = useTypingIndicator();
  const { onEvent: onTypingEvent, reset: resetTyping } = typingIndicator;
  const status = useRealtimeChannel({
    topic: summary?.conversationId ? `chat:${summary.conversationId}` : null,
    events: EVENTS,
    onEvent: (event, payload) => {
      if (event === "message") {
        void fetchNewer();
        // Their message arrived: they are no longer typing it.
        resetTyping();
      }
      if (event === "typing") onTypingEvent(payload);
      if (event === "reaction" && typeof payload.message_id === "string") {
        patchMessage(payload.message_id, { reactions: reactionsFromEvent(payload, { viewer: "customer" }) });
      }
      if (event === "seen") {
        patchDetails({
          adminRead: {
            at: (payload.admin_read_at as string | null) ?? null,
            messageId: (payload.admin_read_message_id as string | null) ?? null,
          },
        });
      }
      // The events only say "it changed"; what is shown always comes from the server.
      if (event === "fulfillment" || event === "state" || event === "assistant" || event === "payment") reloadDetails();
    },
    onResync: () => {
      // Reconnected: no stale "is typing…" from before the gap.
      resetTyping();
      void fetchNewer();
      reloadDetails();
    },
  });

  // 0032: my own typing, throttled, to the admins (server-published).
  const typingUrl = `/api/order-chat/${encodeURIComponent(orderNumber)}/typing`;
  const typingSender = useTypingSender(
    summary?.conversationId
      ? (state) => void fetch(typingUrl, { ...jsonInit("POST", { state }), keepalive: true }).catch(() => undefined)
      : null,
  );

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

  // Payment Received (0027): the summary names the confirmed card; a card
  // still shown unconfirmed is re-read once (this is also how a missed
  // event or a cached thread catches up). Only an admin's confirmation
  // sets it — never a receipt the customer sent.
  const { refreshMessage } = thread;
  const staleCardId = paymentMessageToRefresh(thread.state.messages, summary?.paymentReceivedMessageId);
  useEffect(() => {
    if (staleCardId) void refreshMessage(staleCardId);
  }, [staleCardId, refreshMessage]);

  const paymentReceived = useMemo(() => latestPaymentReceived(thread.state.messages), [thread.state.messages]);
  const paymentSent = useMemo(
    () => Boolean(summary?.paymentSent) || thread.state.messages.some((message) => message.kind === "payment"),
    [summary?.paymentSent, thread.state.messages],
  );

  const isOwnSide = useCallback((message: ChatMessageDto) => message.senderRole === "customer", []);
  // Support messages: the admin's public username (never a real name), once
  // per consecutive group, with the BudgetWise logo as the avatar.
  const senderLabelFor = useCallback(
    (message: ChatMessageDto) => (message.senderRole === "admin" ? (message.senderName ?? "BudgetWise") : null),
    [],
  );
  const senderIconFor = useCallback(
    (message: ChatMessageDto) => (message.senderRole === "admin" ? <BrandAvatar className="size-4" /> : null),
    [],
  );
  // 0032: reactions, Reply and jump-to-original.
  const quoteLabel = useCallback(
    (quote: ReplyQuote) => (quote.senderRole === "customer" ? "You" : (quote.senderName ?? "BudgetWise")),
    [],
  );
  const replySenderLabel = useCallback(
    (message: ChatMessageDto) => (message.senderRole === "customer" ? "yourself" : (message.senderName ?? "BudgetWise")),
    [],
  );
  const features = useMessageFeatures({ thread, senderLabelOf: replySenderLabel, quoteLabel });
  useFocusOrderSlip(thread.state.loaded ? thread.state.messages : null, features.actions.jumpTo);
  const { stop: stopTyping } = typingSender;
  const sendText = useCallback(
    (text: string) => {
      stopTyping();
      features.sendText(text);
    },
    [stopTyping, features],
  );
  const assistant = useMemo(
    () => (details ? currentAssistant(details.assistant ?? null, thread.state.messages) : null),
    [details, thread.state.messages],
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

  // Back: straight back to the in-app screen this chat was opened from (My
  // Orders, or the page where "Message Us Now" was tapped — instant, from
  // memory); otherwise forward to My Orders.
  const goBack = (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (chatBackReturns()) router.back();
    else router.push(MY_ORDERS);
  };

  // A General Inquiry (no order): no payment notice, order summary or slip.
  const isInquiry = isInquiryKey(orderNumber);
  const welcome = useWelcome(orderNumber, messages?.signedIn ? messages.conversations.length : null);
  const placedOrder = usePlacedOrder();
  const orderTotal = details?.orderTotal ?? conversationOrders.length;
  const patchOrderSlots = useCallback(
    (orderRef: string, next: CustomerSlot[]) =>
      patchDetails({
        orders: (cache.get(orderNumber)?.details?.orders ?? []).map((order) =>
          order.orderNumber === orderRef ? { ...order, slots: next } : order,
        ),
      }),
    [cache, orderNumber, patchDetails],
  );

  const completed = summary?.state === "done";
  const statusText = completed ? "Completed" : summary && !isInquiry ? formatOrderStatus(summary.status) : "";

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <header className="border-border/60 bg-background/95 sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur sm:px-3">
        <Link
          href={MY_ORDERS}
          onClick={goBack}
          className="hover:bg-muted active:bg-muted inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-75"
          aria-label="Back"
          data-testid="chat-back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <BrandAvatar className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm leading-tight font-bold">
            BudgetWise
            <ConnectionBadge status={status} graceMs={CONNECTION_GRACE_MS} className="text-[11px] font-normal" />
          </p>
          <p className="text-foreground/80 mt-0.5 truncate text-xs leading-tight font-medium" data-testid="chat-assistant">
            {details ? assistantLine(assistant) : " "}
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-[11px] leading-tight" data-testid="chat-subject">
            {isInquiry ? (
              orderTotal > 0 ? (
                <span data-testid="conversation-subject">
                  Your chat · {orderTotal} order{orderTotal === 1 ? "" : "s"}
                </span>
              ) : (
                "General Inquiry"
              )
            ) : (
              <>
                Order <span className="[font-variant-numeric:tabular-nums]">{orderNumber}</span>
              </>
            )}
            {statusText && (
              <>
                {" · "}
                <span className={cn(completed && "font-semibold text-emerald-700 dark:text-emerald-300")}>
                  {statusText}
                  {completed && " ✓"}
                </span>
              </>
            )}
            {summary && !isInquiry && ` · ${formatPrice(summary.totalAmount)}`}
          </p>
        </div>
      </header>

      {movedTo ? (
        <div className="flex flex-1 items-center justify-center" aria-busy="true">
          <span className="text-muted-foreground text-sm">Opening your chat…</span>
        </div>
      ) : missing && !summary ? (
        <OrderUnavailable isInquiry={isInquiry} />
      ) : (
        <>
          {summary && !isInquiry && (
            <OrderNotice completed={completed} paymentSent={paymentSent} paymentReceived={paymentReceived} />
          )}

          {summary && summary.lines.length > 0 && (
            <OrderSummaryStrip lines={summary.lines} itemCount={summary.itemCount} total={summary.totalAmount} />
          )}

          {slots.length > 0 && (
            <GamepassSection orderNumber={orderNumber} slots={slots} onSlotsChange={(next) => patchDetails({ slots: next })} />
          )}

          {/* 0033: each order in the conversation with links still to add. */}
          {conversationOrders
            .filter((order) => order.slots.length > 0)
            .map((order) => (
              <GamepassSection
                key={order.orderNumber}
                orderNumber={order.orderNumber}
                slots={order.slots}
                labelPrefix={conversationOrders.length > 1 ? order.orderNumber : undefined}
                onSlotsChange={(next) => patchOrderSlots(order.orderNumber, next)}
              />
            ))}

          {welcome.show && !isInquiry && <WelcomeCard onDismiss={welcome.dismiss} />}
          {isInquiry && placedOrder.orderNumber && (
            <PlacedBanner orderNumber={placedOrder.orderNumber} onDismiss={placedOrder.dismiss} />
          )}

          <MessageActionsContext.Provider value={features.actions}>
          <ChatThread
            state={thread.state}
            orderNumber={orderNumber}
            slip={slip}
            isOwnSide={isOwnSide}
            isMine={isOwnSide}
            footer={
              typingIndicator.typingName !== undefined && status === "live" ? (
                <TypingIndicator label={`${typingIndicator.typingName ?? "BudgetWise"} is typing…`} />
              ) : null
            }
            senderLabelFor={senderLabelFor}
            senderIconFor={senderIconFor}
            otherSideReadCursor={adminRead}
            initialReadCursor={ownRead.current ?? NO_CURSOR}
            onLoadOlder={() => void thread.loadOlder()}
            loadError={thread.loadError}
            onReload={() => void thread.reload()}
            onRetry={thread.retry}
            onDiscard={thread.discard}
            onReadUpTo={onReadUpTo}
            emptyState={
              isInquiry ? (
                <div className="text-muted-foreground mx-auto max-w-xs py-10 text-center text-sm" data-testid="inquiry-empty">
                  <p className="text-foreground font-semibold">Ask us anything</p>
                  <p className="mt-1">Robux, gamepasses, or an order you&apos;re planning — we&apos;ll reply right here.</p>
                </div>
              ) : (
                <p className="text-muted-foreground py-10 text-center text-sm">Say hi to BudgetWise!</p>
              )
            }
          />
          </MessageActionsContext.Provider>

          <Composer
            placeholder="Type a message…"
            onSendText={sendText}
            onSendImages={thread.sendAlbum}
            onTyping={typingSender.typing}
            onStopTyping={typingSender.stop}
            replyTo={features.replyTo}
            onCancelReply={features.cancelReply}
          />
        </>
      )}
    </div>
  );
}

function OrderUnavailable({ isInquiry }: { isInquiry: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <SearchX className="text-muted-foreground size-10" />
      <p className="font-heading text-base font-semibold">We couldn&apos;t find this {isInquiry ? "chat" : "order"}</p>
      <p className="text-muted-foreground max-w-xs text-sm">It may belong to a different account. Your orders are all in My Orders.</p>
      <Link href={MY_ORDERS} className="bg-primary text-primary-foreground mt-1 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
        Go to My Orders
      </Link>
    </div>
  );
}

/** One compact line, chosen from structured state only (never chat text). */
function OrderNotice({
  completed,
  paymentSent,
  paymentReceived,
}: {
  completed: boolean;
  paymentSent: boolean;
  paymentReceived: boolean;
}) {
  if (completed) {
    return (
      <p className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-900 sm:px-4 dark:text-emerald-100">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        Completed ✓ — this order is finished. Message us here anytime.
      </p>
    );
  }
  if (paymentReceived) {
    return (
      <p className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-900 sm:px-4 dark:text-emerald-100">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        Payment Received ✓ — BudgetWise verified your payment.
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
  labelPrefix,
}: {
  orderNumber: string;
  slots: CustomerSlot[];
  onSlotsChange: (slots: CustomerSlot[]) => void;
  /** 0033: which order, when the conversation has several. */
  labelPrefix?: string;
}) {
  const waiting = slots.filter((slot) => slot.status === "waiting").length;
  const [open, setOpen] = useState(waiting > 0);
  const label =
    (labelPrefix ? `${labelPrefix} · ` : "") +
    (waiting > 0
      ? `Gamepass link${slots.length > 1 ? "s" : ""} needed (${slots.length - waiting} of ${slots.length} added)`
      : `Gamepass link${slots.length > 1 ? "s" : ""} submitted ✓`);
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

/**
 * ?focus=BW-XXXX (My Orders, an old order link) or ?placed=BW-XXXX (just
 * checked out): bring that order's slip into view once, with a soft glow.
 */
function useFocusOrderSlip(messages: ChatMessageDto[] | null, jumpTo: (messageId: string) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !messages) return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("focus") ?? params.get("placed");
    if (!target || !/^BW-/.test(target)) {
      done.current = true;
      return;
    }
    const slip = messages.find((message) => message.kind === "slip" && message.orderRef === target);
    if (!slip) return; // not loaded yet — the next page of messages may have it
    done.current = true;
    jumpTo(slip.id);
    requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>(`[data-order-slip="${CSS.escape(target)}"]`);
      node?.classList.add("bw-focus-ring");
      window.setTimeout(() => node?.classList.remove("bw-focus-ring"), 2200);
    });
    if (params.has("focus")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("focus");
      window.history.replaceState(window.history.state, "", url);
    }
  }, [messages, jumpTo]);
}

/** ?placed=BW-XXXX after checkout (0033: the order is in this conversation). */
function usePlacedOrder() {
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  useEffect(() => {
    const placed = new URLSearchParams(window.location.search).get("placed");
    if (placed && /^BW-[A-Z0-9]+$/.test(placed)) setOrderNumber(placed);
  }, []);
  const dismiss = useCallback(() => {
    setOrderNumber(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("placed")) {
      url.searchParams.delete("placed");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);
  return { orderNumber, dismiss };
}

function PlacedBanner({ orderNumber, onDismiss }: { orderNumber: string; onDismiss: () => void }) {
  return (
    <div
      className="bw-card-in border-primary/15 bg-primary/5 mx-3 mt-3 flex items-start gap-3 rounded-2xl border p-3.5 sm:mx-4"
      role="status"
      data-testid="placed-banner"
    >
      <CheckCircle2 className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-semibold">
          Order <span className="[font-variant-numeric:tabular-nums]">{orderNumber}</span> placed!
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
          It&apos;s in this chat. BudgetWise will review it and send this order&apos;s payment details right here.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-primary hover:bg-primary/10 -m-1 inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold"
      >
        Got it
      </button>
    </div>
  );
}
