"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";
import { hasSessionCookie, warmChat } from "@/lib/chat/client/customer-store";
import { badgeText } from "@/lib/chat/order-summary.mjs";
import { cn } from "@/lib/utils";

const COACHMARK_KEY = "bw:coachmark:messages:v1";
const MY_ORDERS = "/account/orders";
/** Picks the right chat once the account is known (sign-in, inquiry key). */
const MESSAGES_ENTRY = "/messages";

/**
 * "Message Us Now": one button for every visitor, bottom-right (above the
 * iPhone home indicator; the cart and catalog buttons sit above it).
 *
 *   signed out                 -> Google sign-in, then straight into the chat
 *   a reply is waiting         -> that conversation
 *   has orders                 -> My Orders: General Inquiry + every order chat
 *   no orders                  -> their General Inquiry, full screen
 *
 * The badge is the server's unread count; a new reply gives it ONE short
 * nudge, and opening the messenger stops it. Every destination is a real
 * page: Back returns here.
 */
export function FloatingMessageButton() {
  const router = useRouter();
  const messages = useCustomerMessages();
  const [nudge, setNudge] = useState(0);
  const [coachmark, setCoachmark] = useState(false);
  const previousUnread = useRef<number | null>(null);
  const total = messages?.totalUnread ?? 0;
  const signedIn = messages?.signedIn ?? null;
  const known = signedIn === true && (messages?.conversations.length ?? 0) > 0;

  useEffect(() => {
    if (!known) return;
    if (previousUnread.current !== null && total > previousUnread.current) setNudge((value) => value + 1);
    previousUnread.current = total;
  }, [total, known]);

  // First time a returning customer sees it: one coachmark, never again.
  useEffect(() => {
    if (!known) return;
    try {
      if (!localStorage.getItem(COACHMARK_KEY)) setCoachmark(true);
    } catch {
      // storage blocked: skip the coachmark
    }
  }, [known]);

  const dismissCoachmark = () => {
    setCoachmark(false);
    try {
      localStorage.setItem(COACHMARK_KEY, "1");
    } catch {
      // ignore
    }
  };

  const unread = messages?.conversations.find((row) => row.unreadCount > 0) ?? null;
  const target = signedIn === true ? (unread?.orderNumber ?? (messages?.hasOrders ? null : messages?.inquiry?.orderNumber ?? null)) : null;
  const href =
    signedIn === false
      ? `/login?next=${encodeURIComponent(MESSAGES_ENTRY)}`
      : signedIn === null
        ? MESSAGES_ENTRY
        : target
          ? `/orders/${encodeURIComponent(target)}`
          : messages?.hasOrders
            ? MY_ORDERS
            : MESSAGES_ENTRY;
  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  if (!messages) return null;
  const badge = badgeText(total);

  return (
    <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 sm:right-6 sm:bottom-6">
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
          // A stale "signed in" (the session expired) goes to sign-in too.
          router.push(signedIn !== false && !hasSessionCookie() ? `/login?next=${encodeURIComponent(MESSAGES_ENTRY)}` : href);
        }}
        aria-label={total > 0 ? `Message Us Now (${total} unread)` : "Message Us Now"}
        data-testid="message-us-now"
        className={cn(
          "bg-primary text-primary-foreground relative inline-flex h-14 items-center gap-2 rounded-full pr-5 pl-4 text-sm font-semibold shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)] transition-transform duration-100 active:scale-95",
          nudge > 0 && "animate-[bw-nudge_0.7s_ease-out_1] motion-reduce:animate-none",
        )}
      >
        <MessageCircle className="size-5 shrink-0" />
        <span>Message Us Now</span>
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
