"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";
import { warmChat } from "@/lib/chat/client/customer-store";
import { badgeText } from "@/lib/chat/order-summary.mjs";
import { cn } from "@/lib/utils";

const COACHMARK_KEY = "bw:coachmark:messages:v1";

/**
 * Mobile, signed-in customers with at least one order: a thumb-reachable
 * messages button (bottom-right, above the iPhone home indicator, below the
 * cart and catalog buttons). The badge is the server's unread count; a new
 * reply gives it ONE short nudge — no endless bouncing — and opening the
 * messenger stops it.
 *
 * Tapping it opens the full-screen chat (a real page, Back returns here)
 * for the order that most needs attention: an unread reply, else the most
 * recently active conversation, else the newest order.
 */
export function FloatingMessageButton() {
  const router = useRouter();
  const messages = useCustomerMessages();
  const [nudge, setNudge] = useState(0);
  const [coachmark, setCoachmark] = useState(false);
  const previousUnread = useRef<number | null>(null);
  const total = messages?.totalUnread ?? 0;
  const visible = Boolean(messages?.signedIn) && (messages?.conversations.length ?? 0) > 0;

  useEffect(() => {
    if (!visible) return;
    if (previousUnread.current !== null && total > previousUnread.current) setNudge((value) => value + 1);
    previousUnread.current = total;
  }, [total, visible]);

  // First time the button appears: one coachmark, never again.
  useEffect(() => {
    if (!visible) return;
    try {
      if (!localStorage.getItem(COACHMARK_KEY)) setCoachmark(true);
    } catch {
      // storage blocked: skip the coachmark
    }
  }, [visible]);

  const dismissCoachmark = () => {
    setCoachmark(false);
    try {
      localStorage.setItem(COACHMARK_KEY, "1");
    } catch {
      // ignore
    }
  };

  const target = messages?.pick()?.orderNumber ?? null;
  const href = target ? `/orders/${encodeURIComponent(target)}` : "/account/orders";
  useEffect(() => {
    if (visible) router.prefetch(href);
  }, [visible, href, router]);

  if (!messages || !visible) return null;
  const badge = badgeText(total);

  return (
    <div
      className="fixed right-4 z-40 sm:hidden"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      {coachmark && (
        <div
          role="status"
          className="bg-foreground text-background absolute right-0 bottom-[calc(100%+0.6rem)] w-56 rounded-2xl px-3.5 py-2.5 text-sm shadow-xl"
        >
          <p className="pr-5 leading-snug">Your BudgetWise messages will appear here.</p>
          <button
            type="button"
            onClick={dismissCoachmark}
            className="absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-full"
            aria-label="Dismiss tip"
          >
            <X className="size-3.5" />
          </button>
          <span className="bg-foreground absolute right-5 -bottom-1.5 size-3 rotate-45" aria-hidden />
        </div>
      )}
      <button
        key={nudge}
        type="button"
        onPointerDown={() => target && warmChat(target)}
        onClick={() => {
          dismissCoachmark();
          setNudge(0);
          router.push(href);
        }}
        aria-label={total > 0 ? `Messages from BudgetWise (${total} unread)` : "Messages from BudgetWise"}
        className={cn(
          "bg-primary text-primary-foreground relative flex size-14 items-center justify-center rounded-full shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)] active:scale-95",
          nudge > 0 && "animate-[bw-nudge_0.7s_ease-out_1] motion-reduce:animate-none",
        )}
      >
        <MessageCircle className="size-6" />
        {badge && (
          <span
            className="ring-background absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white ring-2"
            data-testid="messages-badge"
          >
            {badge}
          </span>
        )}
      </button>
    </div>
  );
}
