import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/pricing";
import type { OrderConfirmation } from "@/lib/queries/orders";

export function getMessengerLink(orderNumber: string): string | null {
  if (!siteConfig.messengerPageId) return null;
  const url = new URL(`https://m.me/${siteConfig.messengerPageId}`);
  url.searchParams.set("ref", orderNumber);
  return url.toString();
}

// Meta doesn't allow websites to prefill a Messenger message, so instead we
// give the customer a ready-to-copy summary to paste in themselves.
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
