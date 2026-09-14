// A one-shot handoff from checkout submission to the success page: records
// exactly which cart items (and quantities) went into a given order, so the
// success page can clear only those, exactly once, then forget the record.
// Using localStorage (not sessionStorage) keeps this working if the success
// link is opened in a new tab; deleting the entry after use is what makes
// revisiting an old confirmation, refreshing it, or navigating Back/Forward
// to it safe — there's nothing left to clear the second time.
const STORAGE_KEY_PREFIX = "budgetwise-order-pending-clear:";

export interface PendingOrderItem {
  gamepassId: string;
  quantity: number;
}

export function writePendingOrderClear(
  orderNumber: string,
  items: PendingOrderItem[],
) {
  try {
    window.localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${orderNumber}`,
      JSON.stringify(items),
    );
  } catch {
    // Storage can be unavailable (private browsing, quota). Worst case the
    // success page won't auto-clear these items; nothing is corrupted.
  }
}

export function readPendingOrderClear(
  orderNumber: string,
): PendingOrderItem[] | null {
  try {
    const raw = window.localStorage.getItem(
      `${STORAGE_KEY_PREFIX}${orderNumber}`,
    );
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return parsed.filter(
      (entry): entry is PendingOrderItem =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as PendingOrderItem).gamepassId === "string" &&
        typeof (entry as PendingOrderItem).quantity === "number",
    );
  } catch {
    return null;
  }
}

export function clearPendingOrderClear(orderNumber: string) {
  try {
    window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${orderNumber}`);
  } catch {
    // ignore
  }
}
