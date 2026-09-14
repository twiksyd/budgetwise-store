// The historical order slip, in both directions.
//
// Everything here is pure and catalog-free on purpose. An order slip must
// permanently say what the customer submitted at checkout, so once
// `buildOrderSnapshotLines` has captured a line at order-creation time,
// `buildOrderConfirmationFromSnapshot` rebuilds the slip from that capture
// alone — it never sees `gamepasses` or `games`, so a later price change,
// rename, Robux-amount change, or availability change cannot reach it.
//
// Plain .mjs (like order-message.mjs) so scripts/test-*.mjs can import the
// real implementation under `node --test` rather than a copy of it.

// Money is stored as numeric(10,2). Rounding each line here keeps float
// multiplication from drifting a centavo away from what Postgres stores.
function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

function toNumber(value) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Turns resolved cart lines (priced against live catalog data at checkout
 * time, by the caller) into the payload persisted by create_store_order.
 *
 * Unit values are what make the slip reconstructable: quantity never has to
 * be back-derived from `line_total / current price` again.
 */
export function buildOrderSnapshotLines(items) {
  return items.map((item) => {
    const quantity = item.quantity;
    const unitPrice = roundMoney(toNumber(item.unitPrice));
    const unitCost = roundMoney(toNumber(item.unitCost));
    const lineTotal = roundMoney(unitPrice * quantity);
    const lineCost = roundMoney(unitCost * quantity);

    return {
      user_id: item.userId,
      gamepass_id: item.gamepassId,
      game_id: item.gameId,
      product_name: item.productName,
      game_name: item.gameName,
      robux_amount: item.unitRobuxAmount,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      is_via_plus: Boolean(item.isViaPlus),
      // Denormalised for the `orders` rows XOB reads, which are per-line
      // totals rather than per-unit values.
      line_robux_amount: item.unitRobuxAmount * quantity,
      line_cost: lineCost,
      line_profit: roundMoney(lineTotal - lineCost),
    };
  });
}

export function sumSnapshotLineTotals(lines) {
  return roundMoney(
    lines.reduce((sum, line) => sum + toNumber(line.line_total), 0),
  );
}

/**
 * Rebuilds the customer-facing order confirmation from stored snapshot rows.
 *
 * `status` is read live from the order's own `orders` row rather than
 * snapshotted — fulfilment state is meant to move, unlike order contents.
 */
export function buildOrderConfirmationFromSnapshot({
  header,
  lines,
  viaPlusDetails = null,
  status = "pending",
}) {
  const orderedLines = [...lines].sort(
    (a, b) => toNumber(a.line_index) - toNumber(b.line_index),
  );

  return {
    orderNumber: header.order_number,
    buyerName: header.buyer_name,
    buyerRobloxUsername: header.buyer_roblox_username,
    viaPlusAccount: viaPlusDetails
      ? {
          robloxDisplayName: viaPlusDetails.roblox_display_name,
          age16Confirmed: viaPlusDetails.age_16_confirmed,
          verifiedAccountConfirmed: viaPlusDetails.verified_account_confirmed,
          viaPlusRobuxAmount: toNumber(viaPlusDetails.via_plus_robux_amount),
        }
      : null,
    status,
    createdAt: header.created_at,
    total: roundMoney(toNumber(header.total_amount)),
    lines: orderedLines.map((line) => {
      const quantity = toNumber(line.quantity);

      return {
        gamepassId: line.gamepass_id ?? "",
        gameName: line.game_name,
        gamepassName: line.product_name,
        // The slip has always shown Robux as a per-line total, and the
        // message formatter still renders it that way.
        robuxAmount: toNumber(line.robux_amount) * quantity,
        sellingPrice: roundMoney(toNumber(line.line_total)),
        quantity,
      };
    }),
  };
}
