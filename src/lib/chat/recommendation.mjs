// In-chat product cards (migration 0033): a game pricelist or one specific
// product an admin sends into a customer's conversation.
//
// What is stored is ids plus a display snapshot from the catalog at send
// time — never a URL. Links are built here from the catalog slug / product
// id, so a card can only ever open BudgetWise's own ordering flow. What the
// customer sees is re-read from the live catalog when the chat loads: a
// changed price shows the current one, a product taken down shows as no
// longer available, and checkout prices everything again on the server.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const RECOMMENDATION_TYPES = /** @type {const} */ (["game", "product"]);

export function isRecommendationType(value) {
  return value === "game" || value === "product";
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * The stored payload, built only from live catalog rows the server has
 * just read (never from client input). Returns null when the rows cannot
 * make a valid card.
 */
export function buildRecommendationPayload({ type, game, product }) {
  if (!isRecommendationType(type) || !game) return null;
  if (!UUID_RE.test(String(game.id)) || !SLUG_RE.test(String(game.slug ?? ""))) return null;
  const gameName = cleanText(game.name, 200);
  if (!gameName) return null;
  const payload = { type, game_id: game.id, game_slug: game.slug, game_name: gameName };
  if (type === "game") return payload;
  if (!product || !UUID_RE.test(String(product.id)) || product.game_id !== game.id) return null;
  const productName = cleanText(product.name, 200);
  const price = Number(product.price);
  if (!productName || !Number.isFinite(price) || price < 0) return null;
  const robux = Number(product.robux_amount);
  return {
    ...payload,
    gamepass_id: product.id,
    product_name: productName,
    price: Math.round(price * 100) / 100,
    ...(Number.isFinite(robux) && robux > 0 ? { robux_amount: Math.round(robux) } : {}),
  };
}

/** Where a card leads: the game's pricelist, or that product preselected. */
export function recommendationHref(card, messageId) {
  if (!card || !SLUG_RE.test(String(card.gameSlug ?? ""))) return null;
  const rec = UUID_RE.test(String(messageId ?? "")) ? `?rec=${messageId}` : "";
  if (card.type === "product") {
    if (!UUID_RE.test(String(card.gamepassId ?? ""))) return null;
    return `/order/${card.gamepassId}${rec}`;
  }
  return `/games/${card.gameSlug}${rec}`;
}

/**
 * The card as clients see it.
 *   payload   the stored snapshot (0033 shape)
 *   live      { game, product, gameImageUrl, productImageUrl } from the
 *             current catalog (missing = no longer listed)
 *   orderedAs the order this card led to (store_order_recommendations),
 *             or null — only ever set from that link, never from a click
 */
export function toProductCard(payload, live = {}, orderedAs = null) {
  if (!payload || typeof payload !== "object" || !isRecommendationType(payload.type)) return null;
  const type = payload.type;
  const game = live.game ?? null;
  const product = live.product ?? null;
  const sentPrice = type === "product" && Number.isFinite(Number(payload.price)) ? Number(payload.price) : null;
  const gameAvailable = Boolean(game) && (game.availability_status ?? "available") === "available";

  let status = "available";
  if (!game) status = "removed";
  else if (type === "product" && !product) status = "removed";
  else if (!gameAvailable) status = "unavailable";
  else if (type === "product" && (product.availability_status ?? "available") !== "available") status = "unavailable";

  const price = type === "product" ? (product && Number.isFinite(Number(product.price)) ? Number(product.price) : sentPrice) : null;
  const robux = type === "product" ? Number(product?.robux_amount ?? payload.robux_amount ?? 0) || null : null;

  return {
    type,
    gameName: cleanText(game?.name ?? payload.game_name, 200),
    gameSlug: SLUG_RE.test(String(game?.slug ?? "")) ? game.slug : String(payload.game_slug ?? ""),
    gameImageUrl: live.gameImageUrl ?? null,
    gamepassId: type === "product" ? String(payload.gamepass_id ?? "") : null,
    productName: type === "product" ? cleanText(product?.display_name || product?.name || payload.product_name, 200) : null,
    productImageUrl: type === "product" ? (live.productImageUrl ?? null) : null,
    price,
    sentPrice,
    priceChanged: type === "product" && price !== null && sentPrice !== null && Math.abs(price - sentPrice) >= 0.005,
    robuxAmount: robux,
    status,
    orderedAs: typeof orderedAs === "string" && orderedAs ? orderedAs : null,
  };
}

/** A recommendation id from a URL / cart (uuid) or null. */
export function parseRecommendationId(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return UUID_RE.test(text) ? text : null;
}
