"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { useCustomerMessages, type CustomerConversation } from "@/components/customer-messages/customer-messages-provider";
import { CustomerOrderChat } from "@/components/order-chat/customer-order-chat";
import { useVisualViewportVars } from "@/lib/chat/client/use-visual-viewport";
import { badgeText } from "@/lib/chat/order-summary.mjs";
import { cn } from "@/lib/utils";

/**
 * The floating button's messenger: a full-height panel over whatever page
 * the customer is on. Nothing navigates — closing it leaves the page, its
 * scroll position and the cart exactly as they were. "View full order"
 * goes to the order page when wanted.
 */
export function MessengerSheet() {
  const messages = useCustomerMessages();
  const open = Boolean(messages?.messengerOpen && messages.messengerOrder);
  useVisualViewportVars(open);
  const [switching, setSwitching] = useState(false);

  if (!messages) return null;
  const relevant = messages.relevant;
  const others = relevant.filter((row) => row.orderNumber !== messages.messengerOrder);
  const otherUnread = others.reduce((sum, row) => sum + row.unreadCount, 0);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setSwitching(false);
          messages.closeMessenger();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-open:animate-in data-open:fade-in-0 fixed inset-0 z-[60] bg-black/40 duration-150" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "bg-background fixed inset-x-0 top-[var(--vvt,0px)] z-[60] flex h-[var(--vvh,100dvh)] flex-col overflow-hidden outline-none",
            "sm:inset-x-auto sm:top-4 sm:right-4 sm:h-[min(44rem,calc(100dvh-2rem))] sm:w-[26rem] sm:rounded-2xl sm:border sm:shadow-2xl",
            "data-open:animate-in data-open:slide-in-from-bottom-6 data-open:fade-in-0 duration-200 motion-reduce:animate-none",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Messages from BudgetWise</DialogPrimitive.Title>
          {switching ? (
            <ConversationSwitcher
              conversations={relevant}
              current={messages.messengerOrder}
              onPick={(orderNumber) => {
                setSwitching(false);
                messages.openMessenger(orderNumber);
              }}
              onBack={() => setSwitching(false)}
            />
          ) : (
            messages.messengerOrder && (
              <CustomerOrderChat
                key={messages.messengerOrder}
                orderNumber={messages.messengerOrder}
                variant="sheet"
                onClose={messages.closeMessenger}
                headerAction={
                  others.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSwitching(true)}
                      className="hover:bg-muted relative inline-flex size-11 shrink-0 items-center justify-center rounded-full"
                      aria-label={`Other conversations (${others.length})`}
                    >
                      <MessagesSquare className="size-5" />
                      {badgeText(otherUnread) && (
                        <span className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {badgeText(otherUnread)}
                        </span>
                      )}
                    </button>
                  ) : null
                }
              />
            )
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ConversationSwitcher({
  conversations,
  current,
  onPick,
  onBack,
}: {
  conversations: CustomerConversation[];
  current: string | null;
  onPick: (orderNumber: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-border/60 flex items-center gap-2 border-b px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} className="hover:bg-muted min-h-10 rounded-full px-3 text-sm font-semibold">
          Back
        </button>
        <p className="font-heading flex-1 text-base font-semibold">BudgetWise Messages</p>
      </header>
      <ul className="flex-1 overflow-y-auto" aria-label="Your conversations">
        {conversations.map((row) => (
          <li key={row.orderNumber}>
            <button
              type="button"
              onClick={() => onPick(row.orderNumber)}
              aria-current={row.orderNumber === current ? "true" : undefined}
              className={cn(
                "border-border/40 flex w-full items-center gap-3 border-b px-4 py-3.5 text-left",
                row.orderNumber === current ? "bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold [font-variant-numeric:tabular-nums]">{row.orderNumber}</p>
                <p className={cn("text-xs", row.unreadCount > 0 ? "text-primary font-semibold" : "text-muted-foreground")}>
                  {row.unreadCount > 0
                    ? "New reply"
                    : row.lastSenderRole === "customer"
                      ? "Waiting for reply"
                      : "In progress"}
                </p>
              </div>
              {badgeText(row.unreadCount) && (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                  {badgeText(row.unreadCount)}
                </span>
              )}
              <ChevronRight className="text-muted-foreground size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
