"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, RotateCw } from "lucide-react";
import { BrandAvatar } from "@/components/brand/brand-avatar";
import { MessengerViewport } from "@/components/order-chat/messenger-viewport";
import { useCustomerMessages } from "@/components/customer-messages/customer-messages-provider";
import { hasSessionCookie, openInquiry } from "@/lib/chat/client/customer-store";

const MY_ORDERS = "/account/orders";

/**
 * Picks the chat for "Message Us Now" and replaces itself with it (so Back
 * from the chat returns to where the button was tapped):
 *   signed out      -> Google sign-in, which comes back here
 *   has orders      -> My Orders (General Inquiry + order chats)
 *   no orders       -> the customer's General Inquiry, created on first use
 * ?to=inquiry always opens the General Inquiry (My Orders' inquiry card).
 */
export function MessagesEntry() {
  const router = useRouter();
  const messages = useCustomerMessages();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(false);
  const signedIn = messages?.signedIn ?? null;
  const hasOrders = messages?.hasOrders ?? false;

  useEffect(() => {
    if (started.current) return;
    if (!hasSessionCookie() || signedIn === false) {
      started.current = true;
      router.replace(`/login?next=${encodeURIComponent("/messages")}`);
      return;
    }
    if (signedIn === null) return; // the account is still loading
    started.current = true;
    const wantsInquiry = new URLSearchParams(window.location.search).get("to") === "inquiry";
    if (hasOrders && !wantsInquiry) {
      router.replace(MY_ORDERS);
      return;
    }
    openInquiry()
      .then((key) => router.replace(`/orders/${encodeURIComponent(key)}`))
      .catch(() => {
        started.current = false;
        setFailed(true);
      });
  }, [signedIn, hasOrders, router, attempt]);

  return (
    <MessengerViewport>
      <div className="bg-background flex h-full min-h-0 flex-col">
        <header className="border-border/60 flex items-center gap-2 border-b px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="hover:bg-muted active:bg-muted inline-flex size-11 shrink-0 items-center justify-center rounded-full"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
          <BrandAvatar className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-tight font-bold">BudgetWise</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-tight">Opening your chat…</p>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center" aria-busy={!failed}>
          {failed ? (
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
              className="border-border hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
            >
              <RotateCw className="size-4" />
              Couldn&apos;t open the chat — try again
            </button>
          ) : (
            <Loader2 className="text-muted-foreground size-6 animate-spin" aria-label="Opening your chat" />
          )}
        </div>
      </div>
    </MessengerViewport>
  );
}
