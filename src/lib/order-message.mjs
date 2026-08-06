const OFFICIAL_WEBSITE = "https://budgetwiseshop.com";

const priceFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatPrice(amount) {
  return priceFormatter.format(amount);
}

export function normalizePlainTextMessage(message) {
  return message.replace(/\r\n?/g, "\n");
}

export function normalizeOrderMessageForMessenger(message) {
  return normalizePlainTextMessage(message).replace(/\t/g, "");
}

export function buildOrderMessage(order) {
  const groups = new Map();

  for (const line of order.lines) {
    const existing = groups.get(line.gameName) ?? [];
    existing.push(line);
    groups.set(line.gameName, existing);
  }

  const lines = [
    "Hello po! Nakapag-checkout na po ako through the BudgetWise website. Kindly review my order below. Thank you po!",
    "",
    "BUDGETWISE ORDER SLIP",
    "",
    `Facebook Name: ${order.buyerName}`,
    `Roblox Username: ${order.buyerRobloxUsername}`,
    `Order Number: ${order.orderNumber}`,
    "",
    "ORDER ITEMS",
  ];

  for (const [gameName, gameLines] of groups.entries()) {
    lines.push("", gameName);

    for (const line of gameLines) {
      const quantitySuffix = line.quantity > 1 ? ` ×${line.quantity}` : "";
      lines.push(
        `• ${line.gamepassName}${quantitySuffix} — ${line.robuxAmount.toLocaleString()} Robux — ${formatPrice(line.sellingPrice)}`,
      );
    }
  }

  lines.push(
    "",
    `TOTAL: ${formatPrice(order.total)}`,
    "",
    "Please send the official payment instructions once the order has been reviewed. I will wait for your reply before sending any payment.",
    "",
    `Website: ${OFFICIAL_WEBSITE}`,
  );

  return normalizePlainTextMessage(lines.join("\n"));
}
