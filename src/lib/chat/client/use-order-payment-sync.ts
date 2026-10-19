"use client";

import { useEffect, useRef } from "react";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";

type PaymentState = "awaiting" | "sent" | "received";

/**
 * 0033: keeps each order's slip chip and latest payment card in a customer
 * conversation in step with the server's per-order payment state (from the
 * summary / details reload that follows every payment event). Without it,
 * a confirmation another admin made — or two confirmations close together —
 * would only refresh the conversation's single "latest confirmed" card.
 * Display only: confirming is still an explicit admin action per card.
 */
export function useOrderPaymentSync(
  messages: ChatMessageDto[],
  states: ReadonlyMap<string, PaymentState> | null,
  patchMessage: (messageId: string, patch: Partial<ChatMessageDto>) => void,
  refreshMessage: (messageId: string) => Promise<unknown>,
) {
  // One re-read per card: if the server's latest card for that order is not
  // loaded yet, the one on screen stays as it is (no refresh loop).
  const refreshed = useRef(new Set<string>());
  useEffect(() => {
    if (!states || states.size === 0) return;
    const latestCard = new Map<string, ChatMessageDto>();
    for (const message of messages) {
      if (message.kind === "slip" && message.order) {
        const state = states.get(message.order.orderNumber);
        if (state && state !== message.order.payment) patchMessage(message.id, { order: { ...message.order, payment: state } });
      }
      if (message.kind === "payment" && (message.orderRef || message.historyOrderNumber)) latestCard.set((message.orderRef ?? message.historyOrderNumber) as string, message);
    }
    for (const [orderNumber, card] of latestCard) {
      if (states.get(orderNumber) !== "received" || card.paymentReceived || refreshed.current.has(card.id)) continue;
      refreshed.current.add(card.id);
      void refreshMessage(card.id);
    }
  }, [messages, states, patchMessage, refreshMessage]);
}
