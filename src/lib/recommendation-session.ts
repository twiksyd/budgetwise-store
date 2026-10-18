"use client";

// The in-chat product card (0033) a customer opened, remembered in this
// browser until they check out, so the resulting order can say which card
// it came from. A hint only: the server links the order to the card solely
// when the card is in this customer's own conversation AND the order
// contains what it recommended — opening a card proves nothing by itself.

const KEY = "bw:chat-recommendation";
const TTL_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface StoredRecommendation {
  id: string;
  gameId: string;
  gamepassId: string | null;
  at: number;
}

export function rememberRecommendation(input: { id: string; gameId: string; gamepassId?: string | null }) {
  if (!UUID_RE.test(input.id) || !UUID_RE.test(input.gameId)) return;
  try {
    // The pricelist page reached from a product card keeps the product.
    const existing = read();
    if (existing && existing.id === input.id && existing.gamepassId && !input.gamepassId) return;
    const value: StoredRecommendation = {
      id: input.id,
      gameId: input.gameId,
      gamepassId: input.gamepassId && UUID_RE.test(input.gamepassId) ? input.gamepassId : null,
      at: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the order simply is not linked to the card.
  }
}

function read(): StoredRecommendation | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as StoredRecommendation | null;
    if (!value || !UUID_RE.test(String(value.id)) || Date.now() - Number(value.at) > TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

/** The remembered card id when this cart still contains what it recommended. */
export function recommendationForCart(items: ReadonlyArray<{ gamepassId: string; gameId: string }>): string | null {
  const stored = read();
  if (!stored) return null;
  const matches = stored.gamepassId
    ? items.some((item) => item.gamepassId === stored.gamepassId)
    : items.some((item) => item.gameId === stored.gameId);
  return matches ? stored.id : null;
}

export function clearRecommendation() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** ?rec=<id> on a page the card opened, if it is a well-formed id. */
export function recommendationFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("rec")?.toLowerCase() ?? "";
  return UUID_RE.test(value) ? value : null;
}
