import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/pricing";
import type { OrderConfirmation } from "@/lib/queries/orders";

export function buildOrderMessage(order: OrderConfirmation): string {
  const lines = order.lines.map(
    (line) =>
      `- ${line.gamepassName} (${line.robuxAmount.toLocaleString()} Robux) — ${formatPrice(line.sellingPrice)}`,
  );

  return [
    `Order ${order.orderNumber}`,
    `Roblox username: ${order.buyerRobloxUsername}`,
    ...lines,
    `Total: ${formatPrice(order.total)}`,
    `Sent from ${siteConfig.url}`,
  ].join("\n");
}

// Plain contact link for pre-purchase questions — no order to reference yet.
export function getGeneralMessengerLink(): string | null {
  if (!siteConfig.messengerPageId) return null;
  return `https://m.me/${siteConfig.messengerPageId}`;
}

// `ref` carries the order number through as referral data for future bot/
// automation use; `text` pre-fills the actual Messenger compose box so the
// customer only has to review and tap Send. Meta blocks auto-*sending* a
// message on a customer's behalf, but pre-filling the compose box is a
// supported, documented part of the same message-shortlink mechanism.
export function getMessengerLink(
  orderNumber: string,
  message: string,
): string | null {
  if (!siteConfig.messengerPageId) return null;
  const url = new URL(`https://m.me/${siteConfig.messengerPageId}`);
  url.searchParams.set("ref", orderNumber);
  url.searchParams.set("text", message);
  return url.toString();
}
