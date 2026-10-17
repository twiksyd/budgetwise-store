"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { Composer } from "@/components/chat/composer";
import { ConnectionBadge } from "@/components/chat/connection-badge";
import { GamepassLinkCard, type CustomerSlot } from "@/components/order-chat/gamepass-link-card";
import { useChatThread } from "@/lib/chat/client/use-chat-thread";
import { useRealtimeChannel } from "@/lib/chat/client/use-realtime-channel";
import { fetchJson } from "@/lib/chat/client/fetch-json";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";

type Cursor = { at: string | null; messageId: string | null };

const EVENTS = ["message", "seen", "fulfillment"] as const;

export function CustomerOrderChat({
  orderNumber,
  conversationId,
  initialMessages,
  initialHasOlder,
  initialAdminRead,
  initialOwnRead,
  initialPaymentSent,
  initialSlots,
}: {
  orderNumber: string;
  conversationId: string | null;
  initialMessages: ChatMessageDto[];
  initialHasOlder: boolean;
  initialAdminRead: Cursor;
  initialOwnRead: Cursor;
  initialPaymentSent: boolean;
  initialSlots: CustomerSlot[];
}) {
  const thread = useChatThread({ orderNumber, viewer: "customer", initialMessages, initialHasOlder });
  const [adminRead, setAdminRead] = useState<Cursor>(initialAdminRead);
  const [slots, setSlots] = useState(initialSlots);
  const ownRead = useRef(initialOwnRead);

  const refreshSlots = useCallback(() => {
    if (initialSlots.length === 0) return;
    void fetchJson<{ slots: CustomerSlot[] }>(`/api/order-chat/${encodeURIComponent(orderNumber)}/fulfillment`)
      .then((body) => setSlots(body.slots))
      .catch(() => undefined);
  }, [orderNumber, initialSlots.length]);

  const { fetchNewer } = thread;
  const status = useRealtimeChannel({
    topic: conversationId ? `chat:${conversationId}` : null,
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
    },
    onResync: () => {
      void fetchNewer();
      refreshSlots();
    },
  });

  const paymentSent = useMemo(
    () => initialPaymentSent || thread.state.messages.some((message) => message.kind === "payment"),
    [initialPaymentSent, thread.state.messages],
  );

  const isOwnSide = useCallback((message: ChatMessageDto) => message.senderRole === "customer", []);
  const senderLabelFor = useCallback(
    (message: ChatMessageDto) => (message.senderRole === "admin" ? "BudgetWise" : null),
    [],
  );
  const { markRead } = thread;
  const onReadUpTo = useCallback((messageId: string) => void markRead(messageId), [markRead]);

  return (
    <div className="flex flex-col gap-4">
      {paymentSent ? (
        <div className="border-primary/20 bg-primary/5 flex gap-2.5 rounded-2xl border p-4">
          <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase">Payment details sent</p>
            <p className="mt-1 text-sm leading-relaxed font-semibold">
              Pay using the payment card in the chat below, then upload your GCash receipt here.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Magbayad gamit ang payment card sa chat, tapos i-upload ang GCash receipt dito.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-100">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase">Wait for our reply</p>
            <p className="mt-1 text-sm leading-relaxed font-semibold">
              Hintayin muna ang reply at official payment instructions namin dito sa chat bago magsend ng payment.
            </p>
          </div>
        </div>
      )}

      <GamepassLinkCard orderNumber={orderNumber} slots={slots} onSlotsChange={setSlots} />

      <section
        className="surface-premium flex h-[72dvh] min-h-[440px] flex-col overflow-hidden rounded-2xl sm:h-[640px]"
        aria-label="Chat with BudgetWise"
      >
        <header className="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full text-sm font-bold">
              BW
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">BudgetWise</p>
              <p className="text-muted-foreground truncate text-xs">Order {orderNumber}</p>
            </div>
          </div>
          <ConnectionBadge status={status} />
        </header>

        <ChatThread
          state={thread.state}
          orderNumber={orderNumber}
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
          placeholder="Mag-type ng message…"
          onSendText={thread.sendText}
          onSendImage={thread.sendImage}
        />
      </section>
      <p className="text-muted-foreground text-center text-xs">
        Receipts and screenshots: JPG, PNG or WebP up to 4 MB, via the image button.
      </p>
    </div>
  );
}
