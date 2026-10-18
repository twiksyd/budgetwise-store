// One ongoing customer conversation + in-chat product cards (0033):
// pure rules shared by the server and the browser.
//   node --test scripts/test-unified-thread.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRecommendationPayload,
  parseRecommendationId,
  recommendationHref,
  toProductCard,
} from "../src/lib/chat/recommendation.mjs";
import { toChatMessage, toOrderSlip } from "../src/lib/chat/dto.mjs";
import { confirmablePaymentIds, paymentStateByOrder } from "../src/lib/chat/payment-received.mjs";
import { quotePreview, quotePreviewFromDto } from "../src/lib/chat/message-meta.mjs";
import { fingerprintOrderRequest } from "../src/lib/order-access.mjs";
import { createInboxState, inboxReducer } from "../src/lib/chat/inbox-state.mjs";

const GAME = { id: "11111111-1111-4111-8111-111111111111", slug: "blox-fruits", name: "Blox Fruits", availability_status: "available" };
const PASS = {
  id: "22222222-2222-4222-8222-222222222222",
  game_id: GAME.id,
  name: "Dragon",
  display_name: null,
  price: 150,
  robux_amount: 2500,
  availability_status: "available",
};
const MSG = "33333333-3333-4333-8333-333333333333";
const CUST = "00000000-0000-0000-0000-0000000000c1";
const ADMIN = "00000000-0000-0000-0000-0000000000a1";

describe("product card payload (built only from live catalog rows)", () => {
  test("game pricelist: ids, slug and name only", () => {
    assert.deepEqual(buildRecommendationPayload({ type: "game", game: GAME }), {
      type: "game",
      game_id: GAME.id,
      game_slug: "blox-fruits",
      game_name: "Blox Fruits",
    });
  });
  test("specific product: + product id, name, price, Robux", () => {
    assert.deepEqual(buildRecommendationPayload({ type: "product", game: GAME, product: PASS }), {
      type: "product",
      game_id: GAME.id,
      game_slug: "blox-fruits",
      game_name: "Blox Fruits",
      gamepass_id: PASS.id,
      product_name: "Dragon",
      price: 150,
      robux_amount: 2500,
    });
  });
  test("refuses anything that is not a clean catalog row", () => {
    assert.equal(buildRecommendationPayload({ type: "game", game: { ...GAME, slug: "../evil" } }), null);
    assert.equal(buildRecommendationPayload({ type: "game", game: { ...GAME, slug: "https://evil.test" } }), null);
    assert.equal(buildRecommendationPayload({ type: "product", game: GAME, product: { ...PASS, game_id: "x" } }), null, "product of another game");
    assert.equal(buildRecommendationPayload({ type: "product", game: GAME, product: { ...PASS, price: -1 } }), null);
    assert.equal(buildRecommendationPayload({ type: "product", game: GAME, product: null }), null);
    assert.equal(buildRecommendationPayload({ type: "bundle", game: GAME }), null);
  });
  test("control characters never reach the card text", () => {
    const payload = buildRecommendationPayload({ type: "product", game: GAME, product: { ...PASS, name: "Dra\u0000gon\n  Pass" } });
    assert.equal(payload.product_name, "Dra gon Pass");
  });
});

describe("where a card leads (BudgetWise's own flow only)", () => {
  test("pricelist -> the game's page; product -> its order page; both carry the card id", () => {
    assert.equal(recommendationHref({ type: "game", gameSlug: "blox-fruits", gamepassId: null }, MSG), `/games/blox-fruits?rec=${MSG}`);
    assert.equal(recommendationHref({ type: "product", gameSlug: "blox-fruits", gamepassId: PASS.id }, MSG), `/order/${PASS.id}?rec=${MSG}`);
  });
  test("never an external or malformed link", () => {
    assert.equal(recommendationHref({ type: "game", gameSlug: "//evil.test", gamepassId: null }, MSG), null);
    assert.equal(recommendationHref({ type: "product", gameSlug: "blox-fruits", gamepassId: "javascript:alert(1)" }, MSG), null);
    assert.equal(recommendationHref({ type: "game", gameSlug: "blox-fruits", gamepassId: null }, "not-a-uuid"), "/games/blox-fruits");
  });
  test("card ids from URLs are validated", () => {
    assert.equal(parseRecommendationId(MSG.toUpperCase()), MSG);
    assert.equal(parseRecommendationId("1 or 1=1"), null);
  });
});

describe("what the customer sees is the LIVE catalog", () => {
  const payload = buildRecommendationPayload({ type: "product", game: GAME, product: PASS });
  test("unchanged product: available, sent price shown, nothing flagged", () => {
    const card = toProductCard(payload, { game: GAME, product: PASS });
    assert.equal(card.status, "available");
    assert.equal(card.price, 150);
    assert.equal(card.priceChanged, false);
    assert.equal(card.orderedAs, null);
  });
  test("price changed since sending: the current price, flagged with the old one", () => {
    const card = toProductCard(payload, { game: GAME, product: { ...PASS, price: 175 } });
    assert.equal(card.price, 175);
    assert.equal(card.sentPrice, 150);
    assert.equal(card.priceChanged, true);
  });
  test("out of stock / game paused / removed are never orderable", () => {
    assert.equal(toProductCard(payload, { game: GAME, product: { ...PASS, availability_status: "out_of_stock" } }).status, "unavailable");
    assert.equal(toProductCard(payload, { game: { ...GAME, availability_status: "temporarily_unavailable" }, product: PASS }).status, "unavailable");
    assert.equal(toProductCard(payload, { game: GAME, product: null }).status, "removed");
    assert.equal(toProductCard(payload, {}).status, "removed");
  });
  test("display names follow the catalog", () => {
    assert.equal(toProductCard(payload, { game: GAME, product: { ...PASS, display_name: "Dragon Fruit" } }).productName, "Dragon Fruit");
  });
  test("'Order placed' only from a verified order link", () => {
    assert.equal(toProductCard(payload, { game: GAME, product: PASS }, "BW-ABC123").orderedAs, "BW-ABC123");
    assert.equal(toProductCard(payload, { game: GAME, product: PASS }, null).orderedAs, null);
  });
});

describe("messages in a customer conversation", () => {
  const base = { order_number: "GI-0A1B2C3D", body: "", created_at: "2026-10-18T10:00:00.000Z", client_message_id: null };
  test("a product card reaches the customer as the card DTO, never the raw payload", () => {
    const row = { ...base, id: MSG, sender_role: "admin", sender_user_id: ADMIN, kind: "product", payload: buildRecommendationPayload({ type: "game", game: GAME }) };
    const dto = toChatMessage(row, { viewer: "customer", viewerUserId: CUST, productLive: new Map([[MSG, { game: GAME }]]) });
    assert.equal(dto.product.type, "game");
    assert.equal(dto.product.gameSlug, "blox-fruits");
    assert.equal(JSON.stringify(dto).includes(ADMIN), false, "no admin id for the customer");
    assert.equal("payload" in dto, false);
  });
  test("a slip in the conversation names its order and carries the order's own facts", () => {
    const row = { ...base, id: "s1", sender_role: "customer", sender_user_id: CUST, kind: "slip", body: "SLIP", order_ref: "BW-AAAAAA" };
    const slipOrders = new Map([
      ["BW-AAAAAA", {
        orderNumber: "BW-AAAAAA", createdAt: base.created_at, total: 300, status: "pending", itemCount: 2,
        items: [{ productName: "Dragon", gameName: "Blox Fruits", quantity: 2, lineTotal: 300, imageUrl: null }],
        payment: "sent", fromRecommendation: true,
      }],
    ]);
    const dto = toChatMessage(row, { viewer: "customer", viewerUserId: CUST, slipOrders });
    assert.equal(dto.orderRef, "BW-AAAAAA");
    assert.equal(dto.order.orderNumber, "BW-AAAAAA");
    assert.equal(dto.order.payment, "sent");
    assert.equal(dto.order.fromRecommendation, true);
  });
  test("an order's payment card says which order it is for", () => {
    const row = {
      ...base, id: "p1", sender_role: "admin", sender_user_id: ADMIN, kind: "payment", order_ref: "BW-AAAAAA",
      payload: { provider: "gcash", label: "GCash", account_name: "B W", account_number: "0917", amount: 300, order_number: "BW-AAAAAA", qr_path: "qr/x.png" },
    };
    const dto = toChatMessage(row, { viewer: "customer", viewerUserId: CUST });
    assert.equal(dto.payment.orderNumber, "BW-AAAAAA");
    assert.equal(JSON.stringify(dto).includes("qr/x.png"), false);
  });
  test("slip shape is whitelisted", () => {
    const slip = toOrderSlip({ orderNumber: "BW-1", total: "12.5", items: [{ productName: "X", extra: "leak" }], payment: "weird", secret: 1 });
    assert.equal(slip.payment, "awaiting");
    assert.equal(slip.total, 12.5);
    assert.equal("secret" in slip, false);
    assert.equal("extra" in slip.items[0], false);
  });
  test("reply quotes name the order / product", () => {
    assert.equal(quotePreview({ kind: "slip", order_ref: "BW-AAAAAA" }), "Order BW-AAAAAA");
    assert.equal(quotePreview({ kind: "payment", order_ref: "BW-AAAAAA" }), "Payment details · BW-AAAAAA");
    assert.equal(quotePreview({ kind: "payment" }), "Payment details");
    assert.equal(quotePreview({ kind: "product", payload: { type: "game", game_name: "Blox Fruits" } }), "Pricelist · Blox Fruits");
    assert.equal(quotePreviewFromDto({ kind: "product", product: { type: "product", gameName: "Blox Fruits", productName: "Dragon" } }), "Dragon");
  });
});

describe("payments stay per order in one conversation", () => {
  const card = (id, orderRef, extra = {}) => ({ id, kind: "payment", orderRef, payment: { orderNumber: orderRef }, paymentReceived: null, ...extra });
  test("each order's latest unconfirmed card is confirmable on its own", () => {
    const messages = [card("a1", "BW-A"), card("b1", "BW-B"), card("q1", null), card("b2", "BW-B")];
    assert.deepEqual([...confirmablePaymentIds(messages, "b2")].sort(), ["a1", "b2", "q1"]);
  });
  test("a confirmed card is not offered again; an older card of the same order never is", () => {
    const messages = [card("a1", "BW-A", { paymentReceived: { confirmedAt: "x" } }), card("b1", "BW-B"), card("b2", "BW-B")];
    assert.deepEqual([...confirmablePaymentIds(messages, null)], ["b2"]);
  });
  test("while the server's awaited card is not loaded yet, nothing is offered", () => {
    assert.equal(confirmablePaymentIds([card("a1", "BW-A")], "zz").size, 0);
  });
  test("server-side payment state per order", () => {
    const states = paymentStateByOrder(
      [
        { id: "a1", order_ref: "BW-A", created_at: "2026-10-18T10:00:00Z" },
        { id: "b1", order_ref: "BW-B", created_at: "2026-10-18T10:01:00Z" },
        { id: "b2", order_ref: "BW-B", created_at: "2026-10-18T10:02:00Z" },
        { id: "q1", order_ref: null, created_at: "2026-10-18T10:03:00Z" },
      ],
      new Set(["a1", "b1"]),
    );
    assert.equal(states.get("BW-A"), "received");
    assert.equal(states.get("BW-B"), "sent", "b1 was confirmed but b2 replaced it");
    assert.equal(states.has(""), false, "quotes are not an order");
  });
});

describe("checkout: the card id is a hint, never part of the order", () => {
  test("the idempotency fingerprint ignores it", () => {
    const order = { items: [{ gamepassId: PASS.id, quantity: 1 }], contact: { name: "Juan", robloxUsername: "juan" } };
    assert.equal(fingerprintOrderRequest(order), fingerprintOrderRequest({ ...order, recommendationId: MSG }));
  });
});

describe("admin inbox: one row per customer", () => {
  const row = {
    conversationId: "c1", orderNumber: "GI-0A1B2C3D", buyerName: "Juan", buyerRobloxUsername: "juan", totalAmount: 100,
    orderCreatedAt: "2026-10-17T09:00:00+00:00", orderStatus: "pending", assignedAdminId: null, assignedAt: null,
    lastMessageId: "m1", lastMessageAt: "2026-10-17T09:00:00+00:00", lastMessageKind: "text", lastMessagePreview: "hi",
    lastSenderRole: "customer", customerReadAt: null, customerReadMessageId: null, paymentDetailsSentAt: null,
    myReadAt: null, myReadMessageId: null, unreadCount: 0, orderCount: 1, latestOrderNumber: "BW-A",
  };
  const event = (kind) => ({
    conversation_id: "c1", order_number: "GI-0A1B2C3D", is_new_conversation: false,
    message: { id: "m2", sender_role: "customer", sender_user_id: CUST, kind, created_at: "2026-10-17T10:00:00+00:00", client_message_id: null },
    row: { last_message_id: "m2", last_message_at: "2026-10-17T10:00:00+00:00", last_message_kind: kind, last_message_preview: "x", last_sender_role: "customer", payment_details_sent_at: null },
  });
  test("a new order in the conversation updates the same row and re-reads its order count", () => {
    const next = inboxReducer(createInboxState({ me: ADMIN, rows: [row] }), { type: "message_event", event: event("slip") });
    assert.equal(Object.keys(next.rows).length, 1);
    assert.equal(next.rows["GI-0A1B2C3D"].lastMessageKind, "slip");
    assert.deepEqual(next.stale, ["GI-0A1B2C3D"]);
  });
  test("ordinary messages do not trigger a re-read", () => {
    const next = inboxReducer(createInboxState({ me: ADMIN, rows: [row] }), { type: "message_event", event: event("text") });
    assert.deepEqual(next.stale, []);
  });
});
