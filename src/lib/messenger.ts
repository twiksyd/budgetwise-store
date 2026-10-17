import { siteConfig } from "@/config/site";
import {
  buildOrderMessage as buildPlainTextOrderMessage,
  normalizeOrderMessageForMessenger,
} from "@/lib/order-message.mjs";
import type { OrderConfirmation } from "@/lib/queries/orders";

export function buildOrderMessage(order: OrderConfirmation): string {
  return normalizeOrderMessageForMessenger(buildPlainTextOrderMessage(order));
}

// The slip posted as the first message of an order's on-site chat.
export function buildChatSlipMessage(order: OrderConfirmation): string {
  return buildPlainTextOrderMessage(order, { nameLabel: "Name" });
}

// Plain contact link for pre-purchase questions, no order to reference yet.
export function getGeneralMessengerLink(): string | null {
  if (!siteConfig.messengerPageId) return null;
  return `https://m.me/${siteConfig.messengerPageId}`;
}

export function getMessengerLink(
  orderNumber: string,
  message: string,
): string | null {
  void orderNumber;
  if (!siteConfig.messengerPageId) return null;
  const messengerUrl = new URL(`https://m.me/${siteConfig.messengerPageId}`);
  messengerUrl.searchParams.set(
    "text",
    normalizeOrderMessageForMessenger(message),
  );
  return messengerUrl.toString();
}
