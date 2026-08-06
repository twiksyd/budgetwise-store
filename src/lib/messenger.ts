import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/pricing";
import type { OrderConfirmation } from "@/lib/queries/orders";

const OFFICIAL_WEBSITE = "https://budgetwiseshop.com";

export function buildOrderMessage(order: OrderConfirmation): string {
  const groups = new Map<string, typeof order.lines>();

  order.lines.forEach((line) => {
    const existing = groups.get(line.gameName) ?? [];
    existing.push(line);
    groups.set(line.gameName, existing);
  });

  const itemSections = Array.from(groups.entries()).flatMap(
    ([gameName, lines]) => [
      gameName,
      ...lines.map((line) => {
        const quantityPrefix = line.quantity > 1 ? `${line.quantity}× ` : "";

        return `• ${quantityPrefix}${line.gamepassName} — ${line.robuxAmount.toLocaleString()} Robux — ${formatPrice(line.sellingPrice)}`;
      }),
      "",
    ],
  );

  return [
    "Hello po! Nakapag-checkout na po ako through the BudgetWise website. Kindly review my order below. Thank you po!",
    "",
    "BUDGETWISE ORDER SLIP",
    "",
    `Order Number: ${order.orderNumber}`,
    `Roblox Username: ${order.buyerRobloxUsername}`,
    "",
    "ORDER ITEMS",
    "",
    ...itemSections,
    `TOTAL: ${formatPrice(order.total)}`,
    "",
    "Please send the official payment instructions once the order has been reviewed. I will wait for your reply before sending any payment.",
    "",
    `Website: ${OFFICIAL_WEBSITE}`,
  ].join("\n");
}

// Plain contact link for pre-purchase questions, no order to reference yet.
export function getGeneralMessengerLink(): string | null {
  if (!siteConfig.messengerPageId) return null;
  return `https://m.me/${siteConfig.messengerPageId}`;
}

// `ref` carries the order number through as referral data for future bot/
// automation use; `text` pre-fills the actual Messenger compose box so the
// customer only has to review and tap Send. Meta blocks auto-sending a
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
