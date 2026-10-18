import type { ChatMessageDto } from "./dto.mjs";
type PaymentLike = Pick<ChatMessageDto, "id" | "kind" | "paymentReceived">;
export function confirmablePaymentId(messages: readonly PaymentLike[] | null | undefined, requestId: string | null | undefined): string | null;
export function paymentMessageToRefresh(messages: readonly PaymentLike[] | null | undefined, confirmedId: string | null | undefined): string | null;
export function latestPaymentReceived(messages: readonly PaymentLike[] | null | undefined): boolean;

/** 0033: the latest unconfirmed card of each order / of the quotes. */
export function confirmablePaymentIds(
  messages: ReadonlyArray<{ id: string; kind: string; orderRef?: string | null; payment?: { orderNumber?: string | null } | null; paymentReceived?: unknown }> | null | undefined,
  requestId: string | null | undefined,
): Set<string>;
/** 0033: order number -> its payment state ("awaiting" when absent). */
export function paymentStateByOrder(
  cards: ReadonlyArray<{ id: string; order_ref: string | null; created_at: string }> | null | undefined,
  confirmedIds: ReadonlySet<string> | null | undefined,
): Map<string, "sent" | "received">;
