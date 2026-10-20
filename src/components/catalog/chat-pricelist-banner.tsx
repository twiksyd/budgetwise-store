"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { recommendationFromLocation, rememberRecommendation } from "@/lib/recommendation-session";

/**
 * Shown when this pricelist was opened from a card in the BudgetWise chat
 * (?rec=…, 0033): a one-line reminder that they can add as much as they
 * like. The card id is remembered so the order can be linked to it (the
 * server verifies that before it shows anything in the chat).
 */
export function ChatPricelistBanner({ gameId }: { gameId: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const rec = recommendationFromLocation();
    if (!rec) return;
    rememberRecommendation({ id: rec, gameId });
    setVisible(true);
  }, [gameId]);
  if (!visible) return null;
  return (
    <div
      className="bw-card-in border-primary/15 bg-primary/[0.06] mt-4 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm"
      role="status"
      data-testid="chat-pricelist-banner"
    >
      <MessageCircle className="text-primary size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">From your BudgetWise chat.</span>{" "}
        <span className="text-muted-foreground">Add anything you like, then check out.</span>
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="hover:bg-primary/10 -m-1 rounded-lg p-1.5"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
