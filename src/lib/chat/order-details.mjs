// The admin Order Details panel, assembled ONLY from order records:
// store_order_snapshots, store_order_line_snapshots,
// store_order_via_plus_details, store_order_fulfillment_details,
// orders.status (read-only, XOB) and store_order_conversations.
// Nothing here reads chat messages.
import { buildFulfillmentView } from "./fulfillment-fields.mjs";

export function buildOrderDetails({
  snapshot,
  lines,
  viaPlus,
  fulfillmentRows,
  status,
  conversation,
  customerEmail,
  artwork,
}) {
  const normalizedLines = [...(lines ?? [])]
    .sort((a, b) => a.line_index - b.line_index)
    .map((line) => ({
      lineIndex: line.line_index,
      gameId: line.game_id ?? null,
      gameName: line.game_name,
      productName: line.product_name,
      quantity: Number(line.quantity),
      robuxAmount: Number(line.robux_amount),
      totalRobux: Number(line.robux_amount) * Number(line.quantity),
      unitPrice: Number(line.unit_price),
      lineTotal: Number(line.line_total),
      isViaPlus: Boolean(line.is_via_plus),
      // The catalog's own product artwork for the frozen gamepass id.
      imageUrl: (line.gamepass_id && artwork?.get(line.gamepass_id)) || null,
    }));

  const fulfillment = buildFulfillmentView(normalizedLines, fulfillmentRows);

  // Group by game in first-appearance order (the order the customer added).
  const groups = [];
  const groupByName = new Map();
  for (const line of normalizedLines) {
    let group = groupByName.get(line.gameName);
    if (!group) {
      group = { gameName: line.gameName, lines: [] };
      groupByName.set(line.gameName, group);
      groups.push(group);
    }
    group.lines.push({
      ...line,
      fulfillment: fulfillment.filter((slot) => slot.lineIndex === line.lineIndex),
    });
  }

  return {
    order: {
      orderNumber: snapshot.order_number,
      createdAt: snapshot.created_at,
      status: status ?? "pending",
      total: Number(snapshot.total_amount),
      conversationId: conversation?.id ?? null,
      assignedAdminId: conversation?.assigned_admin_id ?? null,
      paymentDetailsSentAt: conversation?.payment_details_sent_at ?? null,
      state: conversation?.state ?? "active",
      doneAt: conversation?.done_at ?? null,
    },
    customer: {
      name: snapshot.buyer_name,
      robloxUsername: snapshot.buyer_roblox_username,
      email: customerEmail ?? null,
    },
    viaPlus: viaPlus
      ? {
          robloxDisplayName: viaPlus.roblox_display_name,
          age16Confirmed: Boolean(viaPlus.age_16_confirmed),
          verifiedAccountConfirmed: Boolean(viaPlus.verified_account_confirmed),
          robuxAmount: Number(viaPlus.via_plus_robux_amount),
        }
      : null,
    groups,
    fulfillmentPending: fulfillment.filter((slot) => slot.status === "waiting").length,
  };
}
