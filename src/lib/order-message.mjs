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

// Kept short on purpose: Messenger's m.me pre-fill drops long text more
// often, and the team works from the items, not the order number.
// `nameLabel` defaults to the Messenger wording; the on-site chat passes
// "Name" because customers no longer give a Facebook name.
export function buildOrderMessage(order, { nameLabel = "Facebook Name" } = {}) {
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
    "Hello po! Ito po order ko from the BudgetWise website:",
    "",
    `${nameLabel}: ${order.buyerName}`,
    `Roblox Username: ${order.buyerRobloxUsername}`,
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

  lines.push("", `TOTAL: ${formatPrice(order.total)}`);

  if (hasRobuxViaPlus) {
    lines.push("", "VIA PLUS PRE-ORDER");

    if (order.viaPlusAccount) {
      lines.push(
        `Order Amount: ${formatRobuxAmount(viaPlusRobuxAmount)}`,
        `Username: ${order.buyerRobloxUsername}`,
        `Display Name: ${order.viaPlusAccount.robloxDisplayName}`,
        "✓ Age 16+ and verified account",
      );
    }

    lines.push(
      "✓ I understand it takes 1–8 hours after confirmed payment, and I get a refund if it's not delivered within 8 hours.",
    );
  }

  return normalizePlainTextMessage(lines.join("\n"));
}
