"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, CheckCircle2, PanelRight, RotateCcw, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import { OrderDetailsPanel } from "@/components/admin-inbox/order-details-panel";
import { PaymentDetailsDialog } from "@/components/admin-inbox/payment-details-dialog";
import { AssignmentControl } from "@/components/admin-inbox/assignment-control";
import { ChatThread } from "@/components/chat/chat-thread";
import { Composer } from "@/components/chat/composer";
import { PaymentConfirmContext, type PaymentConfirmActions } from "@/components/chat/payment-card";
import { MessageActionsContext } from "@/components/chat/message-actions";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { useMessageFeatures } from "@/lib/chat/client/use-message-features";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useChatThread } from "@/lib/chat/client/use-chat-thread";
import { fetchJson, jsonInit, RequestError } from "@/lib/chat/client/fetch-json";
import type { ChatMessageDto, ReplyQuote } from "@/lib/chat/dto.mjs";
import type { OrderDetails } from "@/lib/chat/order-details.mjs";
import { isPaymentReceived, type InboxRow } from "@/lib/chat/inbox-state.mjs";
import { confirmablePaymentId, paymentMessageToRefresh } from "@/lib/chat/payment-received.mjs";
import { attentionState, repliedBy } from "@/lib/chat/inbox-attention.mjs";
import { staffName } from "@/components/admin-inbox/staff-avatar";
import { describeConversationPresence } from "@/lib/chat/presence-state.mjs";
import { formatPrice } from "@/lib/pricing";
import { isInquiryKey } from "@/lib/order-chat.mjs";

const VIEWING_HEARTBEAT_MS = 20_000;
const VIEWING_SETTLE_MS = 250;
const TYPING_THROTTLE_MS = 2_500;

/**
 * One open conversation. Everything it shows comes from the inbox's
 * conversation cache (keyed by order number), so a chat opened before — or
 * prefetched — renders instantly and refreshes in the background, and a
 * late response for another chat can never appear here.
 */
export function ConversationView({ orderNumber }: { orderNumber: string }) {
  const { me, directory, inbox, dispatch, presence, nowMs, quickReplies, sendSignal, activeRef, cache, loader, select, takeFocusRequest, subscribe } =
    useInbox();
  // The open chat can leave the current filter (e.g. marked Done while in
  // Active); keep showing what we last knew about it.
  const lastRow = useRef<InboxRow | undefined>(undefined);
  if (inbox.rows[orderNumber]) lastRow.current = inbox.rows[orderNumber];
  const row: InboxRow | undefined = inbox.rows[orderNumber] ?? lastRow.current;
  const thread = useChatThread({ orderNumber, viewer: "admin", cache, loader });
  const getEntry = useCallback(() => cache.get(orderNumber), [cache, orderNumber]);
  const entry = useSyncExternalStore(cache.subscribe, getEntry, getEntry);
  const details: OrderDetails | null = entry?.details ?? null;
  const detailsLoading = !details && !entry?.detailsError;
  const setDetails = useCallback((next: OrderDetails) => cache.setDetailsLocal(orderNumber, next), [cache, orderNumber]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  // Opened by click/Enter: put the cursor in the reply box (desktop only —
  // on phones that would pop the keyboard over the chat).
  useEffect(() => {
    if (!takeFocusRequest(orderNumber)) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    sectionRef.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus({ preventScroll: true });
  }, [orderNumber, takeFocusRequest]);

  // My read position when the chat was opened (for the "Unread" divider).
  const initialRead = useRef<{ at: string | null; messageId: string | null } | null>(null);
  if (initialRead.current === null && row) {
    initialRead.current = { at: row.myReadAt, messageId: row.myReadMessageId };
  }

  // A deep-linked chat that is not in the loaded page: fetch just its row.
  useEffect(() => {
    if (row) return;
    void fetchJson<{ row: InboxRow }>(`/api/admin/inbox/${encodeURIComponent(orderNumber)}`)
      .then(({ row: fetched }) => dispatch({ type: "upsert_row", row: fetched, activeOrderNumber: orderNumber }))
      .catch(() => undefined);
  }, [row, orderNumber, dispatch]);

  // Loading is started by the inbox when the chat is selected (thread and
  // details in parallel); realtime updates are merged by the inbox too.
  const loadDetails = useCallback(() => loader.ensureDetails(orderNumber, { force: true }), [loader, orderNumber]);

  // Tell the inbox which chat is open (its messages don't add unread).
  useEffect(() => {
    activeRef.current = { orderNumber, isRead: document.visibilityState === "visible" };
    const onVisibility = () => {
      if (activeRef.current.orderNumber !== orderNumber) return;
      activeRef.current = { orderNumber, isRead: document.visibilityState === "visible" };
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      // Switching: the next chat has already claimed activeRef.
      if (activeRef.current.orderNumber === orderNumber) activeRef.current = { orderNumber: null, isRead: false };
    };
  }, [orderNumber, activeRef]);

  // Viewing signal + heartbeat; "left" when switching away or closing.
  // Only announced once the chat stays open briefly: flicking through ten
  // chats should not send twenty signals (and hit the signal rate limit).
  useEffect(() => {
    let announced = false;
    let heartbeat: number | undefined;
    const settle = window.setTimeout(() => {
      announced = true;
      sendSignal("viewing", orderNumber);
      heartbeat = window.setInterval(() => {
        if (document.visibilityState === "visible") sendSignal("viewing", orderNumber);
      }, VIEWING_HEARTBEAT_MS);
    }, VIEWING_SETTLE_MS);
    const onHide = () => {
      if (announced) sendSignal("left", orderNumber, { beacon: true });
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearTimeout(settle);
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", onHide);
      if (announced) sendSignal("left", orderNumber);
    };
  }, [orderNumber, sendSignal]);

  const lastTyping = useRef(0);
  const onTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTyping.current < TYPING_THROTTLE_MS) return;
    lastTyping.current = now;
    sendSignal("typing", orderNumber);
  }, [orderNumber, sendSignal]);
  const onStopTyping = useCallback(() => {
    if (!lastTyping.current) return;
    lastTyping.current = 0;
    sendSignal("stopped", orderNumber);
  }, [orderNumber, sendSignal]);

  // My own read position only.
  const { markRead } = thread;
  const messagesRef = useRef<ChatMessageDto[]>([]);
  messagesRef.current = thread.state.messages;
  // Optimistic: my badge clears at once; the server call runs in the
  // background and, if it fails, my real count is fetched back.
  const onReadUpTo = useCallback(
    (messageId: string) => {
      const message = messagesRef.current.find((item) => item.id === messageId);
      if (!message) return;
      void markRead(messageId).then((result) => {
        if (result !== "failed") return;
        void fetchJson<{ row: InboxRow }>(`/api/admin/inbox/${encodeURIComponent(orderNumber)}`)
          .then(({ row: fresh }) => dispatch({ type: "upsert_row", row: fresh, activeOrderNumber: orderNumber }))
          .catch(() => undefined);
      });
      dispatch({ type: "mark_read", orderNumber, at: message.createdAt, messageId });
    },
    [markRead, dispatch, orderNumber],
  );

  const isOwnSide = useCallback((message: ChatMessageDto) => message.senderRole === "admin", []);
  const isMine = useCallback((message: ChatMessageDto) => message.senderUserId === me, [me]);
  const customerName = row?.buyerName ?? details?.customer.name ?? "Customer";
  // A General Inquiry (0026): the customer only — no total, items or payment.
  const isInquiry = isInquiryKey(orderNumber);
  const senderLabelFor = useCallback(
    (message: ChatMessageDto) => {
      if (message.senderRole === "customer") return customerName;
      if (message.senderUserId === me) return "Sent by you";
      return `Sent by ${message.senderUserId ? (directory[message.senderUserId]?.displayName ?? "another admin") : "BudgetWise"}`;
    },
    [customerName, directory, me],
  );

  const activity = describeConversationPresence(presence, orderNumber, { me, directory, nowMs });

  // 0032: reactions (as my own admin identity), Reply and jump-to-original.
  const staffLabelOf = useCallback(
    (adminId: string | null | undefined) =>
      !adminId ? "BudgetWise" : adminId === me ? "you" : staffName(directory[adminId], "another admin"),
    [me, directory],
  );
  const quoteLabel = useCallback(
    (quote: ReplyQuote) => (quote.senderRole === "customer" ? customerName : staffLabelOf(quote.senderUserId)),
    [customerName, staffLabelOf],
  );
  const replySenderLabel = useCallback(
    (message: ChatMessageDto) => (message.senderRole === "customer" ? customerName : staffLabelOf(message.senderUserId)),
    [customerName, staffLabelOf],
  );
  const features = useMessageFeatures({ thread, senderLabelOf: replySenderLabel, quoteLabel });
  const sendText = useCallback(
    (text: string) => {
      features.sendText(text);
    },
    [features],
  );
  const assignedAdminId = row?.assignedAdminId ?? details?.order.assignedAdminId ?? null;
  const handlerName = assignedAdminId && assignedAdminId !== me ? staffName(directory[assignedAdminId], "Another admin") : null;
  const total = row?.totalAmount ?? details?.order.total ?? 0;

  const templateValues = useMemo(
    () => ({
      customer_name: customerName,
      order_number: orderNumber,
      roblox_username: row?.buyerRobloxUsername ?? details?.customer.robloxUsername ?? null,
      total: formatPrice(total),
    }),
    [customerName, orderNumber, row?.buyerRobloxUsername, details?.customer.robloxUsername, total],
  );

  // BudgetWise's own workflow state (Active / Done) — never XOB's status.
  // A chat marked Done leaves the Active list (its row disappears there),
  // so the open view also follows the realtime state events directly.
  const [liveState, setLiveState] = useState<{ state: "active" | "done"; doneBy: string | null } | null>(null);
  useEffect(
    () =>
      subscribe((event, payload) => {
        if (event !== "conversation" || payload.order_number !== orderNumber) return;
        if (payload.state === "active" || payload.state === "done") {
          setLiveState({ state: payload.state, doneBy: (payload.done_by as string | null) ?? null });
        }
      }),
    [subscribe, orderNumber],
  );
  const conversationState = liveState?.state ?? row?.state ?? details?.order.state ?? "active";
  const [stateBusy, setStateBusy] = useState(false);
  const changeState = useCallback(
    async (next: "active" | "done") => {
      if (stateBusy) return;
      setStateBusy(true);
      try {
        const messages = messagesRef.current;
        const result = await fetchJson<{ state: "active" | "done"; doneAt: string | null; doneBy: string | null }>(
          `/api/admin/orders/${encodeURIComponent(orderNumber)}/state`,
          jsonInit("POST", { state: next, lastSeenMessageId: messages[messages.length - 1]?.id ?? null }),
        );
        setLiveState({ state: result.state, doneBy: result.doneBy });
        if (row) {
          dispatch({
            type: "upsert_row",
            row: { ...row, state: result.state, doneAt: result.doneAt, doneBy: result.doneBy },
            activeOrderNumber: orderNumber,
          });
        }
        toast.success(next === "done" ? "Marked Done. It reopens by itself if the customer writes again." : "Reopened.");
      } catch (error) {
        toast.error(error instanceof RequestError ? error.message : "Could not update. Please try again.");
        void thread.fetchNewer();
      } finally {
        setStateBusy(false);
      }
    },
    [stateBusy, orderNumber, row, dispatch, thread],
  );
  const doneBy = liveState ? liveState.doneBy : (row?.doneBy ?? null);
  const doneByName = doneBy ? (doneBy === me ? "you" : (directory[doneBy]?.displayName ?? "another admin")) : null;

  // ---- Payment Received (0027). BudgetWise's own verification state, never
  // XOB's. The card to confirm is the order's latest payment card; another
  // admin's confirmation arrives as an inbox row update and the card is
  // re-read from the server (also after a missed event).
  const { refreshMessage, addConfirmed, fetchNewer } = thread;
  // Order chats and (0031) General Inquiry quotes alike.
  const confirmableId = confirmablePaymentId(thread.state.messages, row?.paymentRequestMessageId);
  const staleCardId = paymentMessageToRefresh(thread.state.messages, row?.paymentReceivedMessageId);
  useEffect(() => {
    if (staleCardId) void refreshMessage(staleCardId);
  }, [staleCardId, refreshMessage]);
  const rowRef = useRef(row);
  rowRef.current = row;
  const nameFor = useCallback(
    (adminId: string | null | undefined) =>
      !adminId ? null : adminId === me ? "you" : (directory[adminId]?.displayName ?? "another admin"),
    [me, directory],
  );
  const confirmPayment = useCallback(
    async (messageId: string) => {
      try {
        const result = await fetchJson<{ created: boolean; message: ChatMessageDto }>(
          `/api/admin/orders/${encodeURIComponent(orderNumber)}/payment-confirmation`,
          jsonInit("POST", { messageId }),
        );
        addConfirmed(result.message);
        const received = result.message.paymentReceived;
        const current = rowRef.current;
        if (current && received) {
          dispatch({
            type: "upsert_row",
            row: {
              ...current,
              paymentRequestMessageId: current.paymentRequestMessageId ?? messageId,
              paymentReceivedMessageId: messageId,
              paymentReceivedAt: received.confirmedAt,
              paymentReceivedBy: received.confirmedBy ?? null,
            },
            activeOrderNumber: orderNumber,
          });
        }
        if (result.created) toast.success("Payment Received. The customer can see it now.");
        else toast.info(`Already confirmed by ${nameFor(received?.confirmedBy) ?? "another admin"}.`);
        return true;
      } catch (error) {
        // Replaced by newer details meanwhile: show them.
        if (error instanceof RequestError && error.status === 409) void fetchNewer();
        toast.error(error instanceof RequestError ? error.message : "Could not confirm. Please try again.");
        return false;
      }
    },
    [orderNumber, addConfirmed, dispatch, nameFor, fetchNewer],
  );
  const paymentActions = useMemo<PaymentConfirmActions>(
    () => ({ confirmableId, confirm: confirmPayment, nameFor }),
    [confirmableId, confirmPayment, nameFor],
  );
  const paid = isPaymentReceived(row);
  // 0028: shared reply state, independent of my unread and of assignment.
  // 0030: the same three shared states as the list.
  const attention = attentionState(row);
  const replier = repliedBy(row);
  const viewers = attention === "seen" ? (row?.viewedBy ?? []) : [];
  const staffLabel = (id: string) => (id === me ? "you" : staffName(directory[id], "another admin"));

  const slip = useMemo(
    () => ({
      orderNumber,
      robloxUsername: row?.buyerRobloxUsername ?? details?.customer.robloxUsername ?? null,
      total: row?.totalAmount ?? details?.order.total ?? null,
    }),
    [orderNumber, row?.buyerRobloxUsername, details?.customer.robloxUsername, row?.totalAmount, details?.order.total],
  );

  const panel = (
    <OrderDetailsPanel
      orderNumber={orderNumber}
      details={details}
      loading={detailsLoading}
      assignedAdminId={assignedAdminId}
      onDetailsChange={setDetails}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      <section ref={sectionRef} className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`Chat with ${customerName}`}>
        <header className="border-border/60 flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => select(null)}
            className="hover:bg-muted -ml-1 rounded-lg p-2 md:hidden"
            aria-label="Back to all chats"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{customerName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {isInquiry ? "General Inquiry" : `${orderNumber} · ${formatPrice(total)}`}
              {paid ? <span className="font-semibold text-emerald-700 dark:text-emerald-300"> · Paid ✓</span> : null}
              {attention === "unopened" ? (
                <span className="font-semibold text-rose-700 dark:text-rose-300" data-testid="header-unopened"> · Unopened</span>
              ) : attention === "seen" ? (
                <span className="font-semibold text-amber-800 dark:text-amber-200" data-testid="header-seen"> · Seen · No reply</span>
              ) : replier && attention !== "quiet" ? (
                <span data-testid="header-replied"> · Replied by {staffLabel(replier)}</span>
              ) : null}
              {viewers.length > 0 ? <span> · Viewed by {viewers.map(staffLabel).join(", ")}</span> : null}
              {activity.text ? <span className="text-primary font-semibold"> · {activity.text}</span> : null}
            </p>
          </div>
          <AssignmentControl orderNumber={orderNumber} assignedAdminId={assignedAdminId} className="hidden sm:flex xl:hidden" />
          {conversationState === "active" ? (
            <button
              type="button"
              onClick={() => void changeState("done")}
              // Done means "I've seen this": not before the thread is on screen.
              disabled={stateBusy || !thread.state.loaded}
              className="border-border hover:bg-muted inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-60"
            >
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>Mark Done</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void changeState("active")}
              disabled={stateBusy}
              className="border-border hover:bg-muted inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-60"
            >
              <RotateCcw className="size-4" />
              <span>Reopen</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold xl:hidden"
          >
            <PanelRight className="size-4" />
            <span className="hidden sm:inline">{isInquiry ? "Customer" : "Order details"}</span>
          </button>
        </header>

        {conversationState === "done" && (
          <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-900 dark:text-emerald-100">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span className="flex-1">
              Done{doneByName ? ` · marked by ${doneByName}` : ""}. It moves back to Active if the customer sends a message.
            </span>
          </div>
        )}

        {handlerName && conversationState !== "done" && (
          <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-900 dark:text-amber-100">
            <UserCheck className="size-4 shrink-0" />
            <span className="flex-1">{handlerName} is currently handling this conversation.</span>
          </div>
        )}

        <PaymentConfirmContext.Provider value={paymentActions}>
        <MessageActionsContext.Provider value={features.actions}>
        <ChatThread
          state={thread.state}
          slip={slip}
          loadError={thread.loadError}
          onReload={() => void thread.reload()}
          orderNumber={orderNumber}
          isOwnSide={isOwnSide}
          isMine={isMine}
          senderLabelFor={senderLabelFor}
          otherSideReadCursor={row ? { at: row.customerReadAt, messageId: row.customerReadMessageId } : null}
          initialReadCursor={initialRead.current}
          onLoadOlder={() => void thread.loadOlder()}
          onRetry={thread.retry}
          onDiscard={thread.discard}
          onReadUpTo={onReadUpTo}
          footer={
            activity.customerTyping || activity.typers.length > 0 ? (
              <>
                {activity.customerTyping && <TypingIndicator label={`${customerName} is typing…`} />}
                {activity.typers.length > 0 && (
                  <TypingIndicator label={`${activity.typers.join(", ")} ${activity.typers.length === 1 ? "is" : "are"} typing…`} />
                )}
              </>
            ) : null
          }
        />
        </MessageActionsContext.Provider>
        </PaymentConfirmContext.Provider>

        <Composer
          placeholder="Reply… (/ for saved replies)"
          onSendText={sendText}
          replyTo={features.replyTo}
          onCancelReply={features.cancelReply}
          onSendImages={thread.sendAlbum}
          allowProofLabel
          quickReplies={quickReplies}
          templateValues={templateValues}
          onTyping={onTyping}
          onStopTyping={onStopTyping}
          actions={
            // Orders use the order total; a General Inquiry (0031) has no
            // order, so the admin enters the quoted amount.
            <PaymentDetailsDialog
              orderNumber={orderNumber}
              total={total}
              mode={isInquiry ? "inquiry" : "order"}
              alreadySent={Boolean(row?.paymentDetailsSentAt ?? details?.order.paymentDetailsSentAt)}
              onSent={(message) => {
                thread.addConfirmed(message);
                void loadDetails();
              }}
            />
          }
        />
      </section>

      <aside className="border-border/60 hidden min-h-0 w-[360px] shrink-0 overflow-y-auto border-l xl:block" aria-label={isInquiry ? "Customer" : "Order details"}>
        {panel}
      </aside>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md xl:hidden">
          <SheetHeader className="border-border/60 border-b">
            <SheetTitle>{isInquiry ? "Customer" : "Order details"}</SheetTitle>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
    </div>
  );
}

