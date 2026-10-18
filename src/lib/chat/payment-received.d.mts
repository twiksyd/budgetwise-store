import type { ChatMessageDto } from "./dto.mjs";
type PaymentLike = Pick<ChatMessageDto, "id" | "kind" | "paymentReceived">;
export function confirmablePaymentId(messages: readonly PaymentLike[] | null | undefined, requestId: string | null | undefined): string | null;
export function paymentMessageToRefresh(messages: readonly PaymentLike[] | null | undefined, confirmedId: string | null | undefined): string | null;
export function latestPaymentReceived(messages: readonly PaymentLike[] | null | undefined): boolean;
