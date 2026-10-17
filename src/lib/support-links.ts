import { siteConfig } from "@/config/site";

// Fallback channel for general questions and support only. Never point
// customers here for anything order-related — orders, order numbers, payment
// instructions and receipts live in the on-site Order Chat.
export function getTikTokSupportLink(): string | null {
  return siteConfig.tiktokUrl;
}

// Where a signed-in customer finds every order and its chat.
export const ORDER_CHAT_HOME_PATH = "/account/orders";
