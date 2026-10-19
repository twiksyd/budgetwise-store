import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/order-chat.mjs";
import { withGameArtwork } from "@/lib/game-artwork";
import { getProductDisplayName } from "@/lib/product-display-name";
import { getProductArtworkMapSafe, getProductArtworkUrlMap } from "@/lib/queries/product-artwork";
import { paymentStateByOrder } from "@/lib/chat/payment-received.mjs";
import { summarizeLines } from "@/lib/chat/order-summary.mjs";
import { buildRecommendationPayload, type RecommendationType } from "@/lib/chat/recommendation.mjs";
import type { OrderSlipInput } from "@/lib/chat/dto.mjs";
import type { StoreGame, StoreGamepass } from "@/types/database";

// One ongoing conversation per customer (migration 0033).
//
// A signed-in customer's General Inquiry thread is THE conversation: new
// orders post their slip there, and an order's payment cards are tagged
// with the order (order_ref). Orders stay separate records; this module
// only reads them for display (slips, product cards) and calls the
// SECURITY DEFINER functions that do every write.

type Supabase = ReturnType<typeof createAdminClient>;

class CustomerThreadError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "CustomerThreadError";
  }
}

/** Before 0033 is applied: columns / functions / tables are missing. */
function isMissingSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "42P01" ||
        error.code === "PGRST202" ||
        error.code === "PGRST204" ||
        error.code === "PGRST205" ||
        /order_ref|home_key|store_order_recommendations|store_chat_thread_presentation/.test(error.message ?? "")),
  );
}

// --------------------------------------------------------------- attach

/**
 * Ties a freshly created order to the signed-in account and puts its slip
 * in the customer's ongoing conversation (created on first use). Safe to
 * replay. "conflict": the order already belongs to someone else.
 * "unavailable": 0033 is not applied yet — the caller uses the old
 * per-order chat, so the app can deploy either side of the migration.
 */
export async function attachOrderToCustomer(input: {
  orderNumber: string;
  userId: string;
  slipText: string;
  customerName: string | null;
  recommendationId: string | null;
}): Promise<{ status: "attached" | "conflict" | "unavailable"; chatKey: string | null }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_attach_order_to_customer", {
    p_order_number: input.orderNumber,
    p_user: input.userId,
    p_slip_text: input.slipText,
    p_customer_name: input.customerName,
    p_recommendation_id: input.recommendationId,
  });
  if (error) {
    if (isMissingSchema(error)) return { status: "unavailable", chatKey: null };
    throw error;
  }
  if (!data?.attached) return { status: "conflict", chatKey: null };
  return { status: "attached", chatKey: data.chat_key ?? input.orderNumber };
}

// ------------------------------------------------------------ linking

/** The customer conversation an order lives in, or null (own chat / pre-0033). */
export async function getOrderHomeKey(orderNumber: string): Promise<string | null> {
  const supabase = createAdminClient();
  let { data, error } = await supabase
    .from("store_chat_thread_presentation")
    .select("home_key")
    .eq("key", orderNumber)
    .maybeSingle();
  if (error && isMissingSchema(error)) {
    ({ data, error } = await supabase.from("store_chat_threads").select("home_key").eq("key", orderNumber).maybeSingle());
  }
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  return data?.home_key ?? null;
}

/** order number -> its conversation, for a page of orders (one query). */
export async function getHomeKeys(orderNumbers: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (orderNumbers.length === 0) return map;
  const supabase = createAdminClient();
  let { data, error } = await supabase
    .from("store_chat_thread_presentation")
    .select("key, home_key")
    .in("key", orderNumbers)
    .not("home_key", "is", null);
  if (error && isMissingSchema(error)) {
    ({ data, error } = await supabase.from("store_chat_threads").select("key, home_key").in("key", orderNumbers).not("home_key", "is", null));
  }
  if (error) {
    if (isMissingSchema(error)) return map;
    throw error;
  }
  for (const row of data ?? []) if (row.home_key) map.set(row.key, row.home_key);
  return map;
}

export interface LinkedOrder {
  orderNumber: string;
  createdAt: string;
  total: number;
}

/** Orders in a customer conversation, newest first. */
export async function listLinkedOrders(homeKey: string, limit = 50): Promise<LinkedOrder[]> {
  const supabase = createAdminClient();
  let { data: threads, error } = await supabase
    .from("store_chat_linked_orders")
    .select("key")
    .eq("home_key", homeKey);
  if (error && isMissingSchema(error)) {
    ({ data: threads, error } = await supabase.from("store_chat_threads").select("key").eq("home_key", homeKey));
  }
  if (error) {
    if (isMissingSchema(error)) return [];
    throw error;
  }
  const keys = (threads ?? []).map((row) => row.key);
  if (keys.length === 0) return [];
  const { data: snapshots, error: snapshotError } = await supabase
    .from("store_order_snapshots")
    .select("order_number, created_at, total_amount")
    .in("order_number", keys)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (snapshotError) throw snapshotError;
  return (snapshots ?? []).map((row) => ({
    orderNumber: row.order_number,
    createdAt: row.created_at,
    total: Number(row.total_amount),
  }));
}

// ------------------------------------------------------------ payments

export type OrderPaymentState = "awaiting" | "sent" | "received";

/** Each order's own payment state from its tagged cards in the conversation. */
export async function loadOrderPaymentStates(
  homeKey: string,
  orderNumbers: string[],
  supabase: Supabase = createAdminClient(),
): Promise<Map<string, { state: OrderPaymentState; sentAt: string | null }>> {
  const result = new Map<string, { state: OrderPaymentState; sentAt: string | null }>();
  for (const order of orderNumbers) result.set(order, { state: "awaiting", sentAt: null });
  if (orderNumbers.length === 0) return result;
  const latest = await supabase.rpc("store_order_payment_states", { p_home: homeKey, p_orders: orderNumbers });
  if (!latest.error) {
    for (const row of latest.data ?? []) result.set(row.order_number, { state: row.state, sentAt: row.sent_at });
    return result;
  }
  if (!isMissingSchema(latest.error)) throw latest.error;
  // 0033/0034 compatibility while migration-first deployment is in flight.
  const { data: cards, error } = await supabase
    .from("store_order_messages")
    .select("id, order_ref, created_at")
    .eq("order_number", homeKey)
    .eq("kind", "payment")
    .in("order_ref", orderNumbers);
  if (error) {
    if (isMissingSchema(error)) return result;
    throw error;
  }
  const { data: legacy, error: legacyError } = await supabase.from("store_order_messages")
    .select("id, order_number, created_at").in("order_number", orderNumbers).eq("kind", "payment").is("order_ref", null);
  if (legacyError) throw legacyError;
  const rows = [ ...(cards ?? []), ...(legacy ?? []).map((card) => ({ ...card, order_ref: card.order_number })) ] as Array<{ id: string; order_ref: string | null; created_at: string }>;
  if (rows.length === 0) return result;
  const { data: confirmations, error: confirmationError } = await supabase
    .from("store_payment_confirmations")
    .select("message_id")
    .in(
      "message_id",
      rows.map((row) => row.id),
    );
  if (confirmationError && !isMissingSchema(confirmationError)) throw confirmationError;
  const confirmed = new Set((confirmations ?? []).map((row) => row.message_id));
  const states = paymentStateByOrder(rows, confirmed);
  for (const order of orderNumbers) {
    const first = rows
      .filter((row) => row.order_ref === order)
      .reduce<string | null>((min, row) => (min === null || row.created_at < min ? row.created_at : min), null);
    result.set(order, { state: states.get(order) ?? "awaiting", sentAt: first });
  }
  return result;
}

// ------------------------------------------------------------- slips

/**
 * Slip cards for orders in a conversation: number, items, total, status,
 * the order's own payment state and whether it came from a product card.
 * All from order records (snapshot, frozen lines, orders.status read-only).
 */
export async function loadSlipOrders(homeKey: string, orderNumbers: string[]): Promise<Map<string, OrderSlipInput>> {
  const map = new Map<string, OrderSlipInput>();
  const unique = [...new Set(orderNumbers)];
  if (unique.length === 0) return map;
  const supabase = createAdminClient();
  const [snapshots, lines, statuses, payments, links] = await Promise.all([
    supabase.from("store_order_snapshots").select("order_number, created_at, total_amount").in("order_number", unique),
    supabase
      .from("store_order_line_snapshots")
      .select("order_number, line_index, gamepass_id, game_name, product_name, quantity, robux_amount, unit_price, line_total")
      .in("order_number", unique),
    supabase.from("orders").select("order_number, status").in("order_number", unique),
    loadOrderPaymentStates(homeKey, unique, supabase),
    supabase.from("store_order_recommendations").select("order_number").in("order_number", unique),
  ]);
  if (snapshots.error) throw snapshots.error;
  if (lines.error) throw lines.error;
  if (statuses.error) throw statuses.error;
  const fromRecommendation = new Set(links.error ? [] : (links.data ?? []).map((row) => row.order_number));
  const statusByOrder = new Map<string, string>();
  for (const row of statuses.data ?? []) if (!statusByOrder.has(row.order_number)) statusByOrder.set(row.order_number, row.status);
  const artwork = await lineArtwork(lines.data ?? []);
  const linesByOrder = new Map<string, NonNullable<typeof lines.data>>();
  for (const line of lines.data ?? []) {
    const list = linesByOrder.get(line.order_number) ?? [];
    list.push(line);
    linesByOrder.set(line.order_number, list);
  }
  for (const snapshot of snapshots.data ?? []) {
    const summarized = summarizeLines(linesByOrder.get(snapshot.order_number) ?? [], artwork);
    map.set(snapshot.order_number, {
      orderNumber: snapshot.order_number,
      createdAt: snapshot.created_at,
      total: Number(snapshot.total_amount),
      status: statusByOrder.get(snapshot.order_number) ?? "pending",
      itemCount: summarized.reduce((sum, line) => sum + line.quantity, 0),
      items: summarized.map((line) => ({
        productName: line.productName,
        gameName: line.gameName,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        imageUrl: line.imageUrl,
      })),
      payment: payments.get(snapshot.order_number)?.state ?? "awaiting",
      fromRecommendation: fromRecommendation.has(snapshot.order_number),
    });
  }
  return map;
}

async function lineArtwork(lines: Array<{ gamepass_id?: string | null }>) {
  const ids = [...new Set(lines.map((line) => line.gamepass_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, string>();
  return getProductArtworkUrlMap(await getProductArtworkMapSafe(ids, { identity: null }));
}

// ------------------------------------------------------- product cards

type CardRow = { id: string; payload: Record<string, unknown> | null };
export interface ProductLive {
  game: StoreGame | null;
  product: StoreGamepass | null;
  gameImageUrl: string | null;
  productImageUrl: string | null;
}

/**
 * The live catalog behind a page of product cards (current name, price,
 * availability, artwork) and the orders they verifiably led to.
 */
export async function loadProductCardData(rows: CardRow[]): Promise<{
  productLive: Map<string, ProductLive>;
  productLinks: Map<string, string>;
}> {
  const productLive = new Map<string, ProductLive>();
  const productLinks = new Map<string, string>();
  if (rows.length === 0) return { productLive, productLinks };
  const gameIds = [...new Set(rows.map((row) => String(row.payload?.game_id ?? "")).filter(isUuid))];
  const passIds = [...new Set(rows.map((row) => String(row.payload?.gamepass_id ?? "")).filter(isUuid))];
  const supabase = createAdminClient();
  const [games, passes, links] = await Promise.all([
    gameIds.length ? supabase.from("store_games").select("*").in("id", gameIds) : Promise.resolve({ data: [], error: null }),
    passIds.length ? supabase.from("store_gamepasses").select("*").in("id", passIds) : Promise.resolve({ data: [], error: null }),
    supabase
      .from("store_order_recommendations")
      .select("order_number, message_id, created_at")
      .in(
        "message_id",
        rows.map((row) => row.id),
      )
      .order("created_at", { ascending: false }),
  ]);
  if (games.error) throw games.error;
  if (passes.error) throw passes.error;
  const gameById = new Map((games.data ?? []).map((game) => [game.id, withGameArtwork(game as StoreGame)]));
  const passById = new Map((passes.data ?? []).map((pass) => [pass.id, pass as StoreGamepass]));
  const artwork = passById.size
    ? getProductArtworkUrlMap(
        await getProductArtworkMapSafe(
          [...passById.values()].map((pass) => ({ id: pass.id, game_id: pass.game_id, name: pass.name })),
          { identity: null },
        ),
      )
    : new Map<string, string>();
  for (const row of rows) {
    const game = gameById.get(String(row.payload?.game_id ?? "")) ?? null;
    const product = passById.get(String(row.payload?.gamepass_id ?? "")) ?? null;
    productLive.set(row.id, {
      game,
      product: product && game && product.game_id === game.id ? product : null,
      gameImageUrl: game?.icon_url ?? null,
      productImageUrl: product ? (artwork.get(product.id) ?? null) : null,
    });
  }
  // Newest order first: a card that led to several orders shows the latest.
  if (!links.error) {
    for (const link of links.data ?? []) if (!productLinks.has(link.message_id)) productLinks.set(link.message_id, link.order_number);
  }
  return { productLive, productLinks };
}

// -------------------------------------------------- admin: catalog search

export interface CatalogGameOption {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  available: boolean;
  productCount: number;
}
export interface CatalogProductOption {
  id: string;
  gameId: string;
  gameName: string;
  gameSlug: string;
  name: string;
  price: number;
  robuxAmount: number;
  imageUrl: string | null;
  available: boolean;
}

/** The real, customer-visible catalog (store_games / store_gamepasses views). */
export async function loadCatalogForPicker(): Promise<{ games: CatalogGameOption[]; products: CatalogProductOption[] }> {
  const supabase = createAdminClient();
  const [games, passes] = await Promise.all([
    supabase.from("store_games").select("*").order("sort_order", { ascending: true }),
    supabase.from("store_gamepasses").select("*").order("robux_amount", { ascending: true }),
  ]);
  if (games.error) throw games.error;
  if (passes.error) throw passes.error;
  const gameRows = (games.data ?? []).map((game) => withGameArtwork(game as StoreGame)).filter((game) => game.slug);
  const gameById = new Map(gameRows.map((game) => [game.id, game]));
  const passRows = ((passes.data ?? []) as StoreGamepass[]).filter((pass) => gameById.has(pass.game_id));
  const artwork = getProductArtworkUrlMap(
    await getProductArtworkMapSafe(
      passRows.map((pass) => ({ id: pass.id, game_id: pass.game_id, name: pass.name })),
      { identity: null },
    ),
  );
  const counts = new Map<string, number>();
  for (const pass of passRows) counts.set(pass.game_id, (counts.get(pass.game_id) ?? 0) + 1);
  return {
    games: gameRows.map((game) => ({
      id: game.id,
      name: game.name,
      slug: game.slug,
      imageUrl: game.icon_url,
      available: (game.availability_status ?? "available") === "available",
      productCount: counts.get(game.id) ?? 0,
    })),
    products: passRows.map((pass) => {
      const game = gameById.get(pass.game_id)!;
      return {
        id: pass.id,
        gameId: game.id,
        gameName: game.name,
        gameSlug: game.slug,
        name: getProductDisplayName(pass),
        price: Number(pass.price),
        robuxAmount: Number(pass.robux_amount),
        imageUrl: artwork.get(pass.id) ?? null,
        available:
          (pass.availability_status ?? "available") === "available" && (game.availability_status ?? "available") === "available",
      };
    }),
  };
}

// ---------------------------------------------------- admin: send a card

/**
 * Sends a pricelist / product card. The payload is built here from the live
 * catalog rows (the request only names ids), so a card can never carry
 * anything that is not real catalog data.
 */
export async function sendRecommendation(input: {
  key: string;
  actorId: string;
  type: RecommendationType;
  gameId: string;
  gamepassId: string | null;
  clientMessageId: string;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data: game, error: gameError } = await supabase.from("store_games").select("*").eq("id", input.gameId).maybeSingle();
  if (gameError) throw gameError;
  let product: StoreGamepass | null = null;
  if (input.type === "product") {
    if (!input.gamepassId) throw new CustomerThreadError("Choose a product.", "invalid");
    const { data, error } = await supabase.from("store_gamepasses").select("*").eq("id", input.gamepassId).maybeSingle();
    if (error) throw error;
    product = (data as StoreGamepass | null) ?? null;
    if (!product) throw new CustomerThreadError("That product is no longer in the catalog.", "not_found");
  }
  if (!game) throw new CustomerThreadError("That game is no longer in the catalog.", "not_found");
  const payload = buildRecommendationPayload({
    type: input.type,
    game: game as StoreGame,
    product: product
      ? { id: product.id, game_id: product.game_id, name: getProductDisplayName(product), price: product.price, robux_amount: product.robux_amount }
      : null,
  });
  if (!payload) throw new CustomerThreadError("That item can't be sent as a card.", "invalid");
  const { data: messageId, error } = await supabase.rpc("store_send_recommendation", {
    p_key: input.key,
    p_actor: input.actorId,
    p_payload: payload as unknown as Record<string, unknown>,
    p_client_message_id: input.clientMessageId,
  });
  if (error) throw error;
  return messageId as string;
}

export { CustomerThreadError };
