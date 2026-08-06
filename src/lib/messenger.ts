import { siteConfig } from "@/config/site";
import { buildOrderMessage as buildPlainTextOrderMessage } from "@/lib/order-message.mjs";
import type { OrderConfirmation } from "@/lib/queries/orders";

export function buildOrderMessage(order: OrderConfirmation): string {
  return buildPlainTextOrderMessage(order);
}

// Plain contact link for pre-purchase questions, no order to reference yet.
export function getGeneralMessengerLink(): string | null {
  if (!siteConfig.messengerPageId) return null;
  return `https://m.me/${siteConfig.messengerPageId}`;
}

// Keep Messenger navigation plain. The complete order message is copied by
// the page first, then the customer pastes and sends it inside Messenger.
export function getMessengerLink(
  orderNumber: string,
  message: string,
): string | null {
  void message;
  if (!siteConfig.messengerPageId) return null;
  const url = new URL(`https://m.me/${siteConfig.messengerPageId}`);
  url.searchParams.set("ref", orderNumber);
  return url.toString();
}
