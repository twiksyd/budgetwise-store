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

function isRobuxViaPlusLine(line) {
  const gameName = line.gameName.trim().toLowerCase();
  return gameName === "robux via plus" || gameName === "robux plus";
}

function formatRobuxAmount(amount) {
  return `${amount.toLocaleString()} Robux`;
}

export function normalizePlainTextMessage(message) {
  return message.replace(/\r\n?/g, "\n");
}

export function normalizeOrderMessageForMessenger(message) {
  return normalizePlainTextMessage(message).replace(/\t/g, "");
}

export function buildOrderMessage(order) {
  const groups = new Map();
  const hasRobuxViaPlus = order.lines.some(isRobuxViaPlusLine);
  const viaPlusRobuxAmount = order.lines.reduce(
    (sum, line) => (isRobuxViaPlusLine(line) ? sum + line.robuxAmount : sum),
    0,
  );

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
        `• ${line.gamepassName}${quantitySuffix} — ${formatRobuxAmount(line.robuxAmount)} — ${formatPrice(line.sellingPrice)}`,
      );
    }
  }

  lines.push(
    "",
    `TOTAL: ${formatPrice(order.total)}`,
  );

  if (hasRobuxViaPlus) {
    if (order.viaPlusAccount) {
      lines.push(
        "",
        "🟣 VIA PLUS PRE-ORDER",
        "",
        "Account Requirements:",
        "✓ Age 16+",
        "✓ Verified Account",
        "",
        `Order Amount: ${formatRobuxAmount(viaPlusRobuxAmount)}`,
        `Username: ${order.buyerRobloxUsername}`,
        `Display Name: ${order.viaPlusAccount.robloxDisplayName}`,
      );
    }

    lines.push(
      "",
      "⚠️ VIA PLUS PRE-ORDER ACKNOWLEDGEMENT",
      "",
      "I acknowledge that Robux Via Plus is a pre-order and may take 1–8 hours to receive after my payment has been confirmed.",
      "",
      "I understand that if my Via Plus Robux is not delivered within 8 hours after confirmed payment, BudgetWise will issue a refund for the affected Via Plus order.",
    );
  }

  lines.push(
    "",
    "Please send the official payment instructions once the order has been reviewed. I will wait for your reply before sending any payment.",
    "",
    `Website: ${OFFICIAL_WEBSITE}`,
  );

  return normalizePlainTextMessage(lines.join("\n"));
}
