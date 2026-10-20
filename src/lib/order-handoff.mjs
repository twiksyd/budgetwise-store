import { buildOrderMessage, normalizeOrderMessageForMessenger } from "./order-message.mjs";

// Where a customer continues an order after checkout.
//
//   "messenger"  the order-slip page, which opens the BudgetWise DGM page in
//                Messenger with the order message ready to send (default).
//   "site"       the on-site customer conversation (0033). Kept in the code
//                for customers from the sources listed in siteChatSources
//                (e.g. "tiktok"); empty = everyone goes to Messenger.
//
// The browser only reports where the customer came from; the server makes
// the decision from site config, so it cannot be steered from the client.

export const TRAFFIC_SOURCES = /** @type {const} */ (["tiktok"]);

/** "tiktok" when this visit clearly came from TikTok, else null. */
export function detectTrafficSource({ search = "", referrer = "", userAgent = "" } = {}) {
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  const utm = (params.get("utm_source") ?? params.get("src") ?? "").trim().toLowerCase();
  if (utm === "tiktok" || params.has("ttclid")) return "tiktok";
  let host = "";
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  // TikTok's in-app browser (it usually sends no referrer).
  if (/BytedanceWebview|musical_ly|TikTok/i.test(userAgent)) return "tiktok";
  return null;
}

/** Only known sources pass; anything else is treated as no source. */
export function parseTrafficSource(value) {
  return TRAFFIC_SOURCES.includes(value) ? value : null;
}

/** The server's choice for one order. */
export function chooseOrderChannel(source, config) {
  const known = parseTrafficSource(source);
  if (known && (config?.siteChatSources ?? []).includes(known)) return "site";
  return config?.channel === "site" ? "site" : "messenger";
}

/** m.me link to the order page with a short, prefilled follow-up message. */
export function orderMessengerLink(pageId, orderNumber, message) {
  if (!pageId || !/^[A-Za-z0-9.]+$/.test(String(pageId))) return null;
  const url = new URL(`https://m.me/${pageId}`);
  if (message) url.searchParams.set("text", normalizeOrderMessageForMessenger(message));
  else if (orderNumber) url.searchParams.set("text", `Hi BudgetWise! I'm following up on my order ${orderNumber}.`);
  return url.toString();
}

/** Rebuild the full slip from frozen order details, never today's catalog prices. */
export function buildMessengerOrderSlip(details) {
  const lines = details.groups.flatMap((group) => group.lines);
  if (details.kind === "inquiry" || !lines.length) return null;
  return normalizeOrderMessageForMessenger(buildOrderMessage({
    orderNumber: details.order.orderNumber,
    buyerName: details.customer.name,
    buyerRobloxUsername: details.customer.robloxUsername,
    total: details.order.total,
    viaPlusAccount: details.viaPlus ? {
      ...details.viaPlus,
      viaPlusRobuxAmount: details.viaPlus.robuxAmount,
    } : null,
    lines: lines.map((line) => ({
      gameName: line.gameName,
      gamepassName: line.productName,
      quantity: line.quantity,
      robuxAmount: line.totalRobux,
      sellingPrice: line.lineTotal,
    })),
  }, { nameLabel: "Name" }));
}
