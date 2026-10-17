// Customer-facing order summaries, built ONLY from the frozen order records
// (store_order_snapshots + store_order_line_snapshots) and the catalog's
// own product artwork. Never from chat text.

/**
 * Lines for display. The same product bought five times is ONE line with
 * quantity 5 (that is how the snapshot stores it), never five cards.
 * `artwork`: Map<gamepassId, url>.
 */
export function summarizeLines(lines, artwork) {
  return [...(lines ?? [])]
    .sort((a, b) => a.line_index - b.line_index)
    .map((line) => ({
      lineIndex: line.line_index,
      productName: line.product_name,
      gameName: line.game_name,
      quantity: Number(line.quantity),
      robuxAmount: line.robux_amount == null ? null : Number(line.robux_amount),
      unitPrice: Number(line.unit_price),
      lineTotal: Number(line.line_total),
      imageUrl: (line.gamepass_id && artwork?.get(line.gamepass_id)) || null,
    }));
}

/** "Blox Fruits · 3 items", "Blox Fruits + 2 more games · 9 items". */
export function describeOrderItems(lines) {
  const itemCount = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const games = [];
  for (const line of lines) {
    const name = line.gameName ?? line.game_name;
    if (name && !games.includes(name)) games.push(name);
  }
  const items = `${itemCount} item${itemCount === 1 ? "" : "s"}`;
  if (games.length === 0) return items;
  if (games.length === 1) return `${games[0]} · ${items}`;
  return `${games[0]} + ${games.length - 1} more game${games.length === 2 ? "" : "s"} · ${items}`;
}

/**
 * Customer wording for BudgetWise's workflow state. Deliberately different
 * from the admin words (Active / Done) and from XOB's order status.
 */
export function customerStateLabel(state) {
  return state === "done" ? "Completed" : "In progress";
}

/**
 * My Orders sections. Unread first (newest reply first), then the rest of
 * the active orders by latest activity; completed orders come from their
 * own paginated section.
 */
export function orderOpenSection(rows) {
  const activity = (row) => Date.parse(row.lastMessageAt ?? row.createdAt) || 0;
  const unread = rows.filter((row) => row.unreadCount > 0).sort((a, b) => activity(b) - activity(a));
  const rest = rows.filter((row) => !(row.unreadCount > 0)).sort((a, b) => activity(b) - activity(a));
  return { unread, active: rest };
}

/**
 * Which conversation the floating message button opens:
 *   1. the newest one with an unread BudgetWise reply
 *   2. the most recently active unresolved (state active) one
 *   3. the most recent order
 * `conversations`: [{ orderNumber, state, unreadCount, lastMessageAt, createdAt }]
 */
export function pickConversation(conversations) {
  if (!conversations?.length) return null;
  const at = (row) => Date.parse(row.lastMessageAt ?? row.createdAt ?? "") || 0;
  const byActivity = [...conversations].sort((a, b) => at(b) - at(a));
  return (
    byActivity.find((row) => row.unreadCount > 0) ??
    byActivity.find((row) => row.state !== "done") ??
    [...conversations].sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0))[0] ??
    null
  );
}

/** Conversations worth listing in the switcher: unread or still active. */
export function relevantConversations(conversations) {
  const at = (row) => Date.parse(row.lastMessageAt ?? row.createdAt ?? "") || 0;
  return (conversations ?? [])
    .filter((row) => row.unreadCount > 0 || row.state !== "done")
    .sort((a, b) => (b.unreadCount > 0) - (a.unreadCount > 0) || at(b) - at(a));
}

/** Badge text: 1..9, then "9+". */
export function badgeText(count) {
  if (!(count > 0)) return null;
  return count > 9 ? "9+" : String(count);
}
