"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, PanelRight, UserCheck } from "lucide-react";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import { OrderDetailsPanel } from "@/components/admin-inbox/order-details-panel";
import { PaymentDetailsDialog } from "@/components/admin-inbox/payment-details-dialog";
import { AssignmentControl } from "@/components/admin-inbox/assignment-control";
import { ChatThread } from "@/components/chat/chat-thread";
import { Composer } from "@/components/chat/composer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useChatThread } from "@/lib/chat/client/use-chat-thread";
import { fetchJson } from "@/lib/chat/client/fetch-json";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import type { OrderDetails } from "@/lib/chat/order-details.mjs";
import type { InboxRow } from "@/lib/chat/inbox-state.mjs";
import { describeConversationPresence } from "@/lib/chat/presence-state.mjs";
import { formatPrice } from "@/lib/pricing";

const VIEWING_HEARTBEAT_MS = 20_000;
const TYPING_THROTTLE_MS = 2_500;

export function ConversationView({ orderNumber }: { orderNumber: string }) {
  const { me, directory, inbox, dispatch, presence, nowMs, quickReplies, subscribe, sendSignal, activeRef } = useInbox();
  const row: InboxRow | undefined = inbox.rows[orderNumber];
  const thread = useChatThread({ orderNumber, viewer: "admin" });
  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  const loadDetails = useCallback(async () => {
    try {
      const body = await fetchJson<{ details: OrderDetails }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}/details`);
      setDetails(body.details);
    } catch {
      // keep the last good copy
    } finally {
      setDetailsLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  // Realtime: only this conversation's events touch this view.
  const { fetchNewer } = thread;
  useEffect(
    () =>
      subscribe((event, payload) => {
        if (event === "resync") {
          void fetchNewer();
          void loadDetails();
          return;
        }
        if (payload.order_number !== orderNumber) return;
        if (event === "message") void fetchNewer();
        if (event === "fulfillment") void loadDetails();
      }),
    [subscribe, orderNumber, fetchNewer, loadDetails],
  );

  // Tell the inbox which chat is open (its messages don't add unread).
  useEffect(() => {
    activeRef.current = { orderNumber, isRead: document.visibilityState === "visible" };
    const onVisibility = () => {
      activeRef.current = { orderNumber, isRead: document.visibilityState === "visible" };
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      activeRef.current = { orderNumber: null, isRead: false };
    };
  }, [orderNumber, activeRef]);

  // Viewing signal + heartbeat; "left" when switching away or closing.
  useEffect(() => {
    sendSignal("viewing", orderNumber);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") sendSignal("viewing", orderNumber);
    }, VIEWING_HEARTBEAT_MS);
    const onHide = () => sendSignal("left", orderNumber, { beacon: true });
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      sendSignal("left", orderNumber);
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
  const onReadUpTo = useCallback(
    (messageId: string) => {
      const message = messagesRef.current.find((item) => item.id === messageId);
      if (!message) return;
      void markRead(messageId).then((result) => {
        if (result) dispatch({ type: "mark_read", orderNumber, at: message.createdAt, messageId });
      });
    },
    [markRead, dispatch, orderNumber],
  );

  const isOwnSide = useCallback((message: ChatMessageDto) => message.senderRole === "admin", []);
  const isMine = useCallback((message: ChatMessageDto) => message.senderUserId === me, [me]);
  const customerName = row?.buyerName ?? details?.customer.name ?? "Customer";
  const senderLabelFor = useCallback(
    (message: ChatMessageDto) => {
      if (message.senderRole === "customer") return customerName;
      if (message.senderUserId === me) return "Sent by you";
      return `Sent by ${message.senderUserId ? (directory[message.senderUserId]?.displayName ?? "another admin") : "BudgetWise"}`;
    },
    [customerName, directory, me],
  );

  const activity = describeConversationPresence(presence, orderNumber, { me, directory, nowMs });
  const assignedAdminId = row?.assignedAdminId ?? details?.order.assignedAdminId ?? null;
  const handlerName = assignedAdminId && assignedAdminId !== me ? (directory[assignedAdminId]?.displayName ?? "Another admin") : null;
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
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`Chat with ${customerName}`}>
        <header className="border-border/60 flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
          <Link href="/admin/orders" className="hover:bg-muted -ml-1 rounded-lg p-2 md:hidden" aria-label="Back to all chats">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{customerName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {orderNumber} · {formatPrice(total)}
              {activity.text ? <span className="text-primary font-semibold"> · {activity.text}</span> : null}
            </p>
          </div>
          <AssignmentControl orderNumber={orderNumber} assignedAdminId={assignedAdminId} className="hidden sm:flex xl:hidden" />
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold xl:hidden"
          >
            <PanelRight className="size-4" />
            <span className="hidden sm:inline">Order details</span>
          </button>
        </header>

        {handlerName && (
          <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-900 dark:text-amber-100">
            <UserCheck className="size-4 shrink-0" />
            <span className="flex-1">{handlerName} is currently handling this conversation.</span>
          </div>
        )}

        <ChatThread
          state={thread.state}
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
            activity.typers.length > 0 ? (
              <p className="text-muted-foreground mt-2 text-xs italic">{activity.typers.join(", ")} {activity.typers.length === 1 ? "is" : "are"} typing…</p>
            ) : null
          }
        />

        <Composer
          placeholder="Reply… (/ for saved replies)"
          onSendText={thread.sendText}
          onSendImage={thread.sendImage}
          quickReplies={quickReplies}
          templateValues={templateValues}
          onTyping={onTyping}
          onStopTyping={onStopTyping}
          actions={
            <PaymentDetailsDialog
              orderNumber={orderNumber}
              total={total}
              alreadySent={Boolean(row?.paymentDetailsSentAt ?? details?.order.paymentDetailsSentAt)}
              onSent={(message) => {
                thread.addConfirmed(message);
                void loadDetails();
              }}
            />
          }
        />
      </section>

      <aside className="border-border/60 hidden min-h-0 w-[360px] shrink-0 overflow-y-auto border-l xl:block" aria-label="Order details">
        {panel}
      </aside>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md xl:hidden">
          <SheetHeader className="border-border/60 border-b">
            <SheetTitle>Order details</SheetTitle>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
    </div>
  );
}

