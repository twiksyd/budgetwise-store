// Shared inbox / order chat: application logic tests (node --test).
// Every route decision, identity rule and UI state transition lives in a
// pure module so it can be exercised here without a browser or database.
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { parseRobloxGamepassUrl } from "../src/lib/chat/gamepass-url.mjs";
import {
  buildFulfillmentView,
  fulfillmentSlotsForLines,
  validateFulfillmentSubmission,
} from "../src/lib/chat/fulfillment-fields.mjs";
import { toChatMessage, toPaymentCard } from "../src/lib/chat/dto.mjs";
import { comparePositions, isAtOrBefore, toMicros } from "../src/lib/chat/cursor.mjs";
import { createRateLimiter } from "../src/lib/chat/rate-limit.mjs";
import { createSignalHandler, SIGNAL_RATE_LIMIT } from "../src/lib/chat/signals.mjs";
import {
  handleAttachment,
  handleFulfillmentSave,
  handlePaymentQr,
} from "../src/lib/chat/route-core.mjs";
import {
  applySignal,
  describeConversationPresence,
  emptyPresence,
  prunePresence,
  TYPING_TTL_MS,
  VIEWING_TTL_MS,
} from "../src/lib/chat/presence-state.mjs";
import {
  deriveConnectionStatus,
  pollIntervalFor,
  reconnectDelay,
  shouldResync,
} from "../src/lib/chat/connection-state.mjs";
import { createInboxState, inboxReducer, visibleRows } from "../src/lib/chat/inbox-state.mjs";
import {
  buildDisplayItems,
  countNewArrivals,
  findFirstUnreadIndex,
  initialThread,
  isSeen,
  threadReducer,
} from "../src/lib/chat/thread-state.mjs";
import {
  applyQuickReply,
  closedMenu,
  detectShortcutQuery,
  filterQuickReplies,
  quickReplyMenuReducer,
  selectedReply,
} from "../src/lib/chat/quick-reply-menu.mjs";
import { renderTemplate } from "../src/lib/chat/template.mjs";
import { buildOrderDetails } from "../src/lib/chat/order-details.mjs";
import { ROBUX_VIA_LINK_GAME_IDS } from "../src/config/robux-via-link-ids.mjs";
import { isSameOrigin } from "../src/lib/chat/origin.mjs";

const VIA_LINK = ROBUX_VIA_LINK_GAME_IDS.coveredTax;
const ROBERT = "00000000-0000-0000-0000-0000000000a1";
const ANDRE = "00000000-0000-0000-0000-0000000000a2";
const KENNETH = "00000000-0000-0000-0000-0000000000a3";
const CUST_A = "00000000-0000-0000-0000-0000000000c1";
const CUST_B = "00000000-0000-0000-0000-0000000000c2";
const QR_PATH = "qr/5f0c1b2a-3d4e-4f60-8a7b-9c0d1e2f3a4b.png";
const MSG_ID = "3f2b8c1e-6d1a-4c1e-9f2a-0a1b2c3d4e5f";
const DIRECTORY = {
  [ROBERT]: { displayName: "Robert" },
  [ANDRE]: { displayName: "Andre" },
  [KENNETH]: { displayName: "Kenneth" },
};

// ===================================================================== URLs
describe("gamepass URL validation and normalisation", () => {
  const canonical = "https://www.roblox.com/game-pass/123456789";
  for (const input of [
    "https://www.roblox.com/game-pass/123456789/My-Pass",
    "https://www.roblox.com/game-pass/123456789",
    "http://www.roblox.com/game-pass/123456789",
    "https://roblox.com/game-pass/123456789",
    "www.roblox.com/game-pass/123456789",
    "roblox.com/game-pass/123456789?ref=share#top",
    "https://www.roblox.com/es/game-pass/123456789/Pase",
    "https://WWW.ROBLOX.COM/game-pass/123456789",
    "  https://www.roblox.com/game-pass/123456789  ",
    "https://create.roblox.com/dashboard/creations/experiences/555/passes/123456789/configure",
  ]) {
    test(`accepts and normalises: ${input.trim()}`, () => {
      assert.deepEqual(parseRobloxGamepassUrl(input), {
        ok: true,
        gamepassId: "123456789",
        canonicalUrl: canonical,
      });
    });
  }

  for (const input of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(document.cookie)//roblox.com/game-pass/1",
    "data:text/html,<script>alert(1)</script>",
    "https://www.roblox.com.evil.com/game-pass/123",
    "https://evil.com/www.roblox.com/game-pass/123",
    "https://roblox.com@evil.com/game-pass/123",
    "https://user:pass@www.roblox.com/game-pass/123",
    "https://www.roblox.com:8443/game-pass/123",
    "https://wwww.roblox.com/game-pass/123",
    "https://rob1ox.com/game-pass/123",
    "https://xn--rblox-bve.com/game-pass/123",
    "https://rоblox.com/game-pass/123", // Cyrillic о
    "https://web.roblox.com/game-pass/123",
    "https://www.roblox.com/redirect?url=https://evil.com/game-pass/123",
    "https://www.roblox.com/games/123/Some-Game",
    "https://www.roblox.com/catalog/123",
    "https://www.roblox.com/game-pass/0",
    "https://www.roblox.com/game-pass/-5",
    "https://www.roblox.com/game-pass/12abc",
    "https://www.roblox.com/game-pass/123456789012345678901",
    "https://www.roblox.com/game-pass/",
    "https://create.roblox.com/dashboard/creations/experiences/x/passes/123",
    "https://create.roblox.com/store/asset/123",
    "<a href=\"https://www.roblox.com/game-pass/123\">x</a>",
    "https://www.roblox.com/game-pass/123<script>",
    "https://www.roblox.com/game-pass/123 extra words",
    "ftp://www.roblox.com/game-pass/123",
    "123456789",
    "",
    `https://www.roblox.com/game-pass/1/${"a".repeat(600)}`,
  ]) {
    test(`rejects: ${input.slice(0, 70)}`, () => {
      assert.equal(parseRobloxGamepassUrl(input).ok, false);
    });
  }

  test("non-strings are rejected without throwing", () => {
    assert.equal(parseRobloxGamepassUrl(null).ok, false);
    assert.equal(parseRobloxGamepassUrl({ toString: () => "https://www.roblox.com/game-pass/1" }).ok, false);
  });
});

// ============================================================ fulfillment
const viaLinkLines = [
  { lineIndex: 0, gameId: "regular-game", quantity: 3 },
  { lineIndex: 1, gameId: VIA_LINK, quantity: 2 },
];

describe("structured fulfillment fields", () => {
  test("Via Link lines get one slot per unit; other games get none", () => {
    const slots = fulfillmentSlotsForLines(viaLinkLines);
    assert.deepEqual(
      slots.map((s) => [s.lineIndex, s.unitIndex, s.fieldKey]),
      [[1, 0, "roblox_gamepass_url"], [1, 1, "roblox_gamepass_url"]],
    );
  });

  test("submission is validated against the order's real slots and normalised", () => {
    assert.deepEqual(
      validateFulfillmentSubmission(viaLinkLines, {
        lineIndex: 1, unitIndex: 1, fieldKey: "roblox_gamepass_url",
        value: "www.roblox.com/game-pass/42/x",
      }),
      { ok: true, lineIndex: 1, unitIndex: 1, fieldKey: "roblox_gamepass_url",
        value: "https://www.roblox.com/game-pass/42", externalId: "42" },
    );
    assert.equal(validateFulfillmentSubmission(viaLinkLines, { lineIndex: 1, unitIndex: 2, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/42" }).ok, false, "unit beyond quantity");
    assert.equal(validateFulfillmentSubmission(viaLinkLines, { lineIndex: 0, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/42" }).ok, false, "not a Via Link line");
    assert.equal(validateFulfillmentSubmission(viaLinkLines, { lineIndex: 1, unitIndex: 0, fieldKey: "private_server_url", value: "x" }).ok, false, "fields are whitelisted");
    assert.equal(validateFulfillmentSubmission(viaLinkLines, { lineIndex: 1, unitIndex: 0, fieldKey: "__proto__", value: "x" }).ok, false);
    assert.equal(validateFulfillmentSubmission(viaLinkLines, { lineIndex: "1", unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/42" }).ok, false, "indexes must be integers");
    assert.equal(validateFulfillmentSubmission(viaLinkLines, { lineIndex: 1, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "javascript:alert(1)" }).ok, false);
  });

  test("view marks each slot provided or waiting from structured rows only", () => {
    const view = buildFulfillmentView(viaLinkLines, [
      { line_index: 1, unit_index: 0, field_key: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/7", external_id: "7", source: "customer", updated_at: "2026-10-17T10:00:00+00:00" },
    ]);
    assert.deepEqual(view.map((v) => [v.unitIndex, v.status, v.value]), [
      [0, "provided", "https://www.roblox.com/game-pass/7"],
      [1, "waiting", null],
    ]);
  });
});

// ===================================================================== DTOs
const paymentRow = {
  id: MSG_ID, order_number: "BW-AAAAAA", sender_role: "admin", sender_user_id: ROBERT,
  kind: "payment", body: "GCash payment details", attachment_path: null, attachment_mime: null,
  client_message_id: "11111111-1111-1111-1111-111111111111", created_at: "2026-10-17T10:00:00+00:00",
  read_at: null,
  payload: { method_id: "m1", provider: "gcash", label: "GCash", account_name: "A L M",
    account_number: "09171234567", amount: 279, currency: "PHP", has_qr: true, qr_path: QR_PATH },
};

describe("customer-facing message shape", () => {
  test("customer payment card exposes only safe fields — never qr_path", () => {
    const message = toChatMessage(paymentRow, { viewer: "customer", viewerUserId: CUST_A });
    assert.deepEqual(message.payment, {
      provider: "gcash", label: "GCash", accountName: "A L M", accountNumber: "09171234567",
      amount: 279, currency: "PHP", hasQr: true, orderNumber: null,
    });
    const json = JSON.stringify(message);
    for (const forbidden of ["qr_path", "qr/", "method_id", "m1", "sender_user_id", ROBERT, "attachment_path", "read_at"]) {
      assert.equal(json.includes(forbidden), false, `customer JSON must not contain ${forbidden}`);
    }
    assert.equal("senderUserId" in message, false);
    assert.equal(message.clientMessageId, null, "admin's client id not shown to customer");
  });

  test("customer image message: has a flag, never the storage path", () => {
    const message = toChatMessage(
      { ...paymentRow, kind: "image", sender_role: "customer", sender_user_id: CUST_A, payload: null,
        attachment_path: "BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/x.jpg", attachment_mime: "image/jpeg" },
      { viewer: "customer", viewerUserId: CUST_A },
    );
    assert.equal(message.hasAttachment, true);
    assert.equal(JSON.stringify(message).includes("BW-AAAAAA/"), false);
    assert.equal(message.clientMessageId, paymentRow.client_message_id, "own messages keep their client id for reconcile");
  });

  test("admin view includes the sender for 'Sent by Robert'", () => {
    const message = toChatMessage(paymentRow, { viewer: "admin" });
    assert.equal(message.senderUserId, ROBERT);
    assert.equal(JSON.stringify(message).includes("qr_path"), false, "admins don't get storage paths either");
  });

  test("malformed payment payloads render nothing rather than garbage", () => {
    assert.equal(toPaymentCard(null), null);
    assert.equal(toPaymentCard({ provider: "paypal", amount: 1 }), null);
    assert.equal(toPaymentCard({ provider: "gcash", amount: "abc" }), null);
  });
});

// =================================================================== cursor
describe("exact message ordering", () => {
  test("microsecond precision beyond what Date holds", () => {
    assert.ok(toMicros("2026-10-17T10:00:00.000001+00:00") > toMicros("2026-10-17T10:00:00+00:00"));
    assert.equal(toMicros("2026-10-17T18:00:00+08:00"), toMicros("2026-10-17T10:00:00Z"));
  });
  test("identical timestamps are ordered by id", () => {
    const at = "2026-10-17T10:00:00.5+00:00";
    assert.equal(comparePositions({ createdAt: at, id: "a" }, { createdAt: at, id: "b" }), -1);
    assert.equal(isAtOrBefore({ createdAt: at, id: "b" }, { at, messageId: "a" }), false);
    assert.equal(isAtOrBefore({ createdAt: at, id: "a" }, { at, messageId: "a" }), true);
  });
});

// ================================================================= signals
describe("typing/viewing signal endpoint", () => {
  function setup({ admin = { id: ROBERT }, limit = SIGNAL_RATE_LIMIT.limit } = {}) {
    const published = [];
    let clock = 1_000_000;
    const handler = createSignalHandler({
      resolveAdmin: async () => admin,
      publish: async (event) => { published.push(event); },
      limiter: createRateLimiter({ limit, windowMs: 20_000, now: () => clock }),
      now: () => clock,
    });
    return { handler, published, tick: (ms) => { clock += ms; } };
  }

  test("identity always comes from the session, never the request", async () => {
    const { handler, published } = setup();
    const result = await handler({
      type: "typing", orderNumber: "BW-AAAAAA",
      admin_user_id: ANDRE, adminUserId: ANDRE, display_name: "Andre", name: "Andre",
    });
    assert.equal(result.status, 202);
    assert.deepEqual(Object.keys(published[0]).sort(), ["admin_user_id", "at", "order_number", "type"]);
    assert.equal(published[0].admin_user_id, ROBERT);
    assert.equal(JSON.stringify(published[0]).includes("Andre"), false, "no names travel in signals");
  });

  test("non-admins (or signed-out users) cannot publish", async () => {
    const { handler, published } = setup({ admin: null });
    assert.equal((await handler({ type: "typing", orderNumber: "BW-AAAAAA" })).status, 401);
    assert.equal(published.length, 0);
  });

  test("only known signal types and valid order numbers", async () => {
    const { handler, published } = setup();
    assert.equal((await handler({ type: "message", orderNumber: "BW-AAAAAA" })).status, 400);
    assert.equal((await handler({ type: "typing", orderNumber: "BW-A'; drop" })).status, 400);
    assert.equal((await handler(null)).status, 400);
    assert.equal(published.length, 0);
  });

  test("rate limited per admin, recovers after the window", async () => {
    const { handler, published, tick } = setup({ limit: 3 });
    for (let i = 0; i < 3; i += 1) assert.equal((await handler({ type: "typing", orderNumber: "BW-AAAAAA" })).status, 202);
    const blocked = await handler({ type: "typing", orderNumber: "BW-AAAAAA" });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.retryAfterMs > 0);
    assert.equal(published.length, 3);
    tick(20_001);
    assert.equal((await handler({ type: "typing", orderNumber: "BW-AAAAAA" })).status, 202);
  });

  test("one admin hitting the limit does not limit another", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    assert.equal(limiter.take(ROBERT).ok, true);
    assert.equal(limiter.take(ROBERT).ok, false);
    assert.equal(limiter.take(ANDRE).ok, true);
  });
});

// ========================================================= route decisions
function viewerFor(userId) {
  // owner of BW-AAAAAA = CUST_A; admins = Robert
  return async (orderNumber) => {
    if (!userId) return { ok: false, status: 401 };
    if (userId === ROBERT) return { ok: true };
    return orderNumber === "BW-AAAAAA" && userId === CUST_A ? { ok: true } : { ok: false, status: 404 };
  };
}

describe("payment QR route", () => {
  const messages = { [MSG_ID]: paymentRow };
  const deps = (userId, signed = []) => ({
    resolveViewer: viewerFor(userId),
    loadMessage: async (orderNumber, messageId) => {
      const row = messages[messageId];
      return row && row.order_number === orderNumber ? row : null;
    },
    signQr: async (path) => { signed.push(path); return `https://signed.example/${path}?token=t`; },
  });

  test("order owner gets a short-lived signed URL for the stored QR", async () => {
    const signed = [];
    const result = await handlePaymentQr({ orderNumber: "BW-AAAAAA", messageId: MSG_ID, deps: deps(CUST_A, signed) });
    assert.equal(result.status, 302);
    assert.deepEqual(signed, [QR_PATH], "path came from the stored message, not the request");
  });

  test("admins can view it", async () => {
    assert.equal((await handlePaymentQr({ orderNumber: "BW-AAAAAA", messageId: MSG_ID, deps: deps(ROBERT) })).status, 302);
  });

  test("customer B cannot open customer A's QR", async () => {
    const signed = [];
    const result = await handlePaymentQr({ orderNumber: "BW-AAAAAA", messageId: MSG_ID, deps: deps(CUST_B, signed) });
    assert.equal(result.status, 404);
    assert.equal(signed.length, 0);
  });

  test("signed-out visitors are refused", async () => {
    assert.equal((await handlePaymentQr({ orderNumber: "BW-AAAAAA", messageId: MSG_ID, deps: deps(null) })).status, 401);
  });

  test("a message from another order cannot be used through my order", async () => {
    const signed = [];
    const result = await handlePaymentQr({ orderNumber: "BW-BBBBBB", messageId: MSG_ID, deps: { ...deps(ROBERT, signed) } });
    assert.equal(result.status, 404);
    assert.equal(signed.length, 0);
  });

  test("arbitrary storage paths are impossible: only a uuid message id is accepted", async () => {
    const signed = [];
    for (const messageId of ["qr/5f0c1b2a-3d4e-4f60-8a7b-9c0d1e2f3a4b.png", "../order-chat-attachments/x.jpg", "%2e%2e%2fsecret", MSG_ID + "/../x"]) {
      const result = await handlePaymentQr({ orderNumber: "BW-AAAAAA", messageId, deps: deps(ROBERT, signed) });
      assert.equal(result.status, 404, messageId);
    }
    assert.equal(signed.length, 0);
  });

  test("a stored path that is not a generated QR name is never signed", async () => {
    const signed = [];
    const tampered = { ...paymentRow, payload: { ...paymentRow.payload, qr_path: "../order-chat-attachments/BW-BBBBBB/receipt.jpg" } };
    const result = await handlePaymentQr({
      orderNumber: "BW-AAAAAA", messageId: MSG_ID,
      deps: { ...deps(ROBERT, signed), loadMessage: async () => tampered },
    });
    assert.equal(result.status, 404);
    assert.equal(signed.length, 0);
  });

  test("non-payment messages have no QR", async () => {
    const result = await handlePaymentQr({
      orderNumber: "BW-AAAAAA", messageId: MSG_ID,
      deps: { ...deps(ROBERT), loadMessage: async () => ({ ...paymentRow, kind: "text" }) },
    });
    assert.equal(result.status, 404);
  });
});

describe("receipt (attachment) route", () => {
  const receipt = { order_number: "BW-AAAAAA", attachment_path: "BW-AAAAAA/c1/abc.jpg" };
  const deps = (userId, signed = []) => ({
    loadMessage: async (id) => (id === MSG_ID ? receipt : null),
    resolveViewer: viewerFor(userId),
    signAttachment: async (path) => { signed.push(path); return `https://signed.example/${path}`; },
  });
  test("owner and admins can open the receipt", async () => {
    assert.equal((await handleAttachment({ messageId: MSG_ID, deps: deps(CUST_A) })).status, 302);
    assert.equal((await handleAttachment({ messageId: MSG_ID, deps: deps(ROBERT) })).status, 302);
  });
  test("customer B cannot open customer A's receipt; nothing is signed", async () => {
    const signed = [];
    assert.equal((await handleAttachment({ messageId: MSG_ID, deps: deps(CUST_B, signed) })).status, 404);
    assert.equal(signed.length, 0);
  });
  test("signed out -> 401, bad id -> 404", async () => {
    assert.equal((await handleAttachment({ messageId: MSG_ID, deps: deps(null) })).status, 401);
    assert.equal((await handleAttachment({ messageId: "../x", deps: deps(ROBERT) })).status, 404);
  });
});

describe("gamepass link submission route", () => {
  const lines = [{ lineIndex: 0, gameId: VIA_LINK, quantity: 1 }];
  function deps({ actor, saved = [] }) {
    return {
      resolveActor: async (orderNumber) => actor(orderNumber),
      loadLines: async () => lines,
      save: async (input) => {
        saved.push(input);
        return { value: input.value, external_id: input.externalId, source: "customer", updated_at: "2026-10-17T10:00:00+00:00" };
      },
    };
  }
  const owner = async (orderNumber) => (orderNumber === "BW-AAAAAA" ? { ok: true, userId: CUST_A } : { ok: false, status: 404 });

  test("owner submits; value is normalised before saving", async () => {
    const saved = [];
    const result = await handleFulfillmentSave({
      orderNumber: "BW-AAAAAA",
      body: { lineIndex: 0, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "roblox.com/game-pass/99/name?x=1", actorId: ANDRE },
      deps: deps({ actor: owner, saved }),
    });
    assert.equal(result.status, 200);
    assert.equal(saved[0].value, "https://www.roblox.com/game-pass/99");
    assert.equal(saved[0].externalId, "99");
    assert.equal(saved[0].actorId, CUST_A, "actor comes from the session, not the body");
  });

  test("another customer's order is invisible (404), nothing saved", async () => {
    const saved = [];
    const result = await handleFulfillmentSave({
      orderNumber: "BW-BBBBBB",
      body: { lineIndex: 0, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/1" },
      deps: deps({ actor: owner, saved }),
    });
    assert.equal(result.status, 404);
    assert.equal(saved.length, 0);
  });

  test("signed out -> 401; invalid URL -> 400 and nothing saved", async () => {
    const saved = [];
    assert.equal((await handleFulfillmentSave({ orderNumber: "BW-AAAAAA", body: {}, deps: deps({ actor: async () => ({ ok: false, status: 401 }), saved }) })).status, 401);
    const bad = await handleFulfillmentSave({
      orderNumber: "BW-AAAAAA",
      body: { lineIndex: 0, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://evil.com/game-pass/1" },
      deps: deps({ actor: owner, saved }),
    });
    assert.equal(bad.status, 400);
    assert.equal(saved.length, 0);
  });

  test("admin correction path uses the admin's session id", async () => {
    const saved = [];
    const result = await handleFulfillmentSave({
      orderNumber: "BW-AAAAAA",
      body: { lineIndex: 0, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/5" },
      deps: deps({ actor: async () => ({ ok: true, userId: ROBERT }), saved }),
    });
    assert.equal(result.status, 200);
    assert.equal(saved[0].actorId, ROBERT);
  });

  test("a non-admin hitting the admin correction endpoint is refused", async () => {
    const saved = [];
    const result = await handleFulfillmentSave({
      orderNumber: "BW-AAAAAA", body: { lineIndex: 0, unitIndex: 0, fieldKey: "roblox_gamepass_url", value: "https://www.roblox.com/game-pass/5" },
      deps: deps({ actor: async () => ({ ok: false, status: 403 }), saved }),
    });
    assert.equal(result.status, 403);
    assert.equal(saved.length, 0);
  });
});

// ============================================================ multi-admin
describe("presence: viewing and typing", () => {
  const t0 = 1_000_000;

  test("two admins in the same chat see each other, never themselves", () => {
    let state = applySignal(emptyPresence, { type: "viewing", admin_user_id: ROBERT, order_number: "BW-AAAAAA" }, t0);
    state = applySignal(state, { type: "viewing", admin_user_id: ANDRE, order_number: "BW-AAAAAA" }, t0);
    assert.equal(describeConversationPresence(state, "BW-AAAAAA", { me: ROBERT, directory: DIRECTORY, nowMs: t0 }).text, "Andre is viewing");
    assert.equal(describeConversationPresence(state, "BW-AAAAAA", { me: ANDRE, directory: DIRECTORY, nowMs: t0 }).text, "Robert is viewing");
  });

  test("typing shows immediately and expires on its own", () => {
    let state = applySignal(emptyPresence, { type: "typing", admin_user_id: KENNETH, order_number: "BW-AAAAAA" }, t0);
    assert.equal(describeConversationPresence(state, "BW-AAAAAA", { me: ROBERT, directory: DIRECTORY, nowMs: t0 + 1 }).text, "Kenneth is typing");
    state = prunePresence(state, t0 + TYPING_TTL_MS + 1);
    assert.equal(describeConversationPresence(state, "BW-AAAAAA", { me: ROBERT, directory: DIRECTORY, nowMs: t0 + TYPING_TTL_MS + 1 }).text, "Kenneth is viewing");
  });

  test("stopped ends typing; left removes the viewer; silence expires viewing", () => {
    let state = applySignal(emptyPresence, { type: "typing", admin_user_id: KENNETH, order_number: "BW-AAAAAA" }, t0);
    state = applySignal(state, { type: "stopped", admin_user_id: KENNETH, order_number: "BW-AAAAAA" }, t0 + 10);
    assert.deepEqual(describeConversationPresence(state, "BW-AAAAAA", { me: ROBERT, directory: DIRECTORY, nowMs: t0 + 10 }).typers, []);
    state = applySignal(state, { type: "left", admin_user_id: KENNETH, order_number: "BW-AAAAAA" }, t0 + 20);
    assert.equal(describeConversationPresence(state, "BW-AAAAAA", { me: ROBERT, directory: DIRECTORY, nowMs: t0 + 20 }).text, "");
    state = applySignal(emptyPresence, { type: "viewing", admin_user_id: ANDRE, order_number: "BW-AAAAAA" }, t0);
    assert.deepEqual(prunePresence(state, t0 + VIEWING_TTL_MS + 1), {}, "a crashed tab disappears after the TTL");
  });

  test("names come from the trusted directory; payload names are ignored", () => {
    const state = applySignal(emptyPresence, { type: "typing", admin_user_id: ANDRE, order_number: "BW-AAAAAA", display_name: "Robert" }, t0);
    assert.equal(describeConversationPresence(state, "BW-AAAAAA", { me: KENNETH, directory: DIRECTORY, nowMs: t0 }).text, "Andre is typing");
    const unknown = applySignal(emptyPresence, { type: "viewing", admin_user_id: "ffffffff-0000-0000-0000-000000000000", order_number: "BW-AAAAAA" }, t0);
    assert.equal(describeConversationPresence(unknown, "BW-AAAAAA", { me: ROBERT, directory: DIRECTORY, nowMs: t0 }).text, "Another admin is viewing");
  });

  test("moving to another chat moves the indicator", () => {
    let state = applySignal(emptyPresence, { type: "viewing", admin_user_id: ANDRE, order_number: "BW-AAAAAA" }, t0);
    state = applySignal(state, { type: "viewing", admin_user_id: ANDRE, order_number: "BW-BBBBBB" }, t0 + 5);
    assert.equal(describeConversationPresence(state, "BW-AAAAAA", { me: ROBERT, directory: DIRECTORY, nowMs: t0 + 5 }).text, "");
    assert.equal(describeConversationPresence(state, "BW-BBBBBB", { me: ROBERT, directory: DIRECTORY, nowMs: t0 + 5 }).text, "Andre is viewing");
  });
});

describe("connection status and reconnect", () => {
  test("Live only when the channel is actually subscribed and online", () => {
    assert.equal(deriveConnectionStatus({ online: true, channelState: "SUBSCRIBED" }), "live");
    assert.equal(deriveConnectionStatus({ online: true, channelState: "CHANNEL_ERROR" }), "reconnecting");
    assert.equal(deriveConnectionStatus({ online: true, channelState: "TIMED_OUT" }), "reconnecting");
    assert.equal(deriveConnectionStatus({ online: true, channelState: "CLOSED" }), "reconnecting");
    assert.equal(deriveConnectionStatus({ online: false, channelState: "SUBSCRIBED" }), "offline");
  });
  test("a first join in progress, or no topic yet, is never shown as a connection problem", () => {
    assert.equal(deriveConnectionStatus({ online: true, channelState: null }), "connecting");
    assert.equal(deriveConnectionStatus({ online: true, channelState: "joining" }), "connecting");
    assert.equal(deriveConnectionStatus({ online: true, channelState: null, hasTopic: false }), "idle");
    assert.equal(deriveConnectionStatus({ online: true, channelState: null, wasLive: true }), "reconnecting");
    assert.equal(deriveConnectionStatus({ online: true, channelState: null, failedBefore: true }), "reconnecting");
  });
  test("backoff grows and caps; polling only while not live", () => {
    assert.deepEqual([0, 1, 2, 3, 10].map(reconnectDelay), [1000, 2000, 4000, 8000, 30000]);
    assert.equal(pollIntervalFor("live"), null);
    assert.equal(pollIntervalFor("reconnecting"), 10_000);
    assert.equal(pollIntervalFor("offline"), null);
    assert.equal(pollIntervalFor("connecting"), 10_000);
    assert.equal(pollIntervalFor("idle"), null);
  });
  test("missed events are fetched on reconnect and on wake, not on first connect", () => {
    assert.equal(shouldResync({ previous: "reconnecting", next: "live", hasConnectedBefore: false }), false);
    assert.equal(shouldResync({ previous: "reconnecting", next: "live", hasConnectedBefore: true }), true);
    assert.equal(shouldResync({ previous: "offline", next: "live", hasConnectedBefore: true }), true);
    assert.equal(shouldResync({ previous: "live", next: "live", hasConnectedBefore: true }), false);
    assert.equal(shouldResync({ previous: "live", next: "live", hasConnectedBefore: true, becameVisible: true }), true);
  });
});

// =================================================================== inbox
function inboxRow(orderNumber, overrides = {}) {
  return {
    conversationId: `conv-${orderNumber}`, orderNumber, buyerName: `Buyer ${orderNumber}`,
    buyerRobloxUsername: `rbx${orderNumber}`, totalAmount: 100, orderCreatedAt: "2026-10-17T09:00:00+00:00",
    orderStatus: "pending", assignedAdminId: null, assignedAt: null,
    lastMessageId: `m-${orderNumber}`, lastMessageAt: "2026-10-17T09:00:00+00:00",
    lastMessageKind: "slip", lastMessagePreview: "Order slip", lastSenderRole: "customer",
    customerReadAt: null, customerReadMessageId: null, paymentDetailsSentAt: null,
    myReadAt: null, myReadMessageId: null, unreadCount: 0, ...overrides,
  };
}
function messageEvent(orderNumber, id, at, overrides = {}) {
  return {
    conversation_id: `conv-${orderNumber}`, order_number: orderNumber, is_new_conversation: false,
    message: { id, sender_role: "customer", sender_user_id: CUST_A, kind: "text", created_at: at, client_message_id: null },
    row: { last_message_id: id, last_message_at: at, last_message_kind: "text", last_message_preview: "hi", last_sender_role: "customer", payment_details_sent_at: null },
    ...overrides,
  };
}

describe("shared inbox state", () => {
  const base = () => createInboxState({
    me: ROBERT,
    rows: [inboxRow("BW-AAAAAA", { lastMessageAt: "2026-10-17T09:00:00+00:00" }), inboxRow("BW-BBBBBB", { lastMessageAt: "2026-10-17T09:30:00+00:00" })],
  });

  test("a new customer message patches one row, moves it to the top and adds unread", () => {
    const next = inboxReducer(base(), { type: "message_event", event: messageEvent("BW-AAAAAA", "m2", "2026-10-17T10:00:00+00:00") });
    assert.deepEqual(next.order, ["BW-AAAAAA", "BW-BBBBBB"]);
    assert.equal(next.rows["BW-AAAAAA"].unreadCount, 1);
    assert.equal(next.rows["BW-AAAAAA"].lastMessagePreview, "hi");
    assert.deepEqual(next.stale, [], "no refetch needed");
  });

  test("optimistic mark-read clears my badge; reporting the same message again changes nothing", () => {
    const unread = inboxReducer(base(), { type: "message_event", event: messageEvent("BW-AAAAAA", "m2", "2026-10-17T10:00:00+00:00") });
    const read = inboxReducer(unread, { type: "mark_read", orderNumber: "BW-AAAAAA", at: "2026-10-17T10:00:00+00:00", messageId: "m2" });
    assert.equal(read.rows["BW-AAAAAA"].unreadCount, 0);
    const again = inboxReducer(read, { type: "mark_read", orderNumber: "BW-AAAAAA", at: "2026-10-17T10:00:00+00:00", messageId: "m2" });
    assert.equal(again, read, "same state object: no re-render of the list");
  });

  test("the same event twice does not double-count", () => {
    const event = messageEvent("BW-AAAAAA", "m2", "2026-10-17T10:00:00+00:00");
    let next = inboxReducer(base(), { type: "message_event", event });
    next = inboxReducer(next, { type: "message_event", event });
    assert.equal(next.rows["BW-AAAAAA"].unreadCount, 1);
  });

  test("a brand-new conversation is fetched as ONE row, never a full refetch", () => {
    const next = inboxReducer(base(), { type: "message_event", event: messageEvent("BW-CCCCCC", "m9", "2026-10-17T11:00:00+00:00", { is_new_conversation: true }) });
    assert.deepEqual(next.stale, ["BW-CCCCCC"]);
    const filled = inboxReducer(next, { type: "upsert_row", row: inboxRow("BW-CCCCCC", { lastMessageAt: "2026-10-17T11:00:00+00:00", unreadCount: 1 }) });
    assert.deepEqual(filled.order, ["BW-CCCCCC", "BW-BBBBBB", "BW-AAAAAA"]);
    assert.deepEqual(filled.stale, []);
  });

  test("messages in the chat I'm reading at the bottom do not add unread", () => {
    const next = inboxReducer(base(), {
      type: "message_event", event: messageEvent("BW-AAAAAA", "m2", "2026-10-17T10:00:00+00:00"),
      activeOrderNumber: "BW-AAAAAA", activeIsRead: true,
    });
    assert.equal(next.rows["BW-AAAAAA"].unreadCount, 0);
  });

  test("another admin reading never clears MY unread; my own read (other tab) does", () => {
    let state = inboxReducer(base(), { type: "message_event", event: messageEvent("BW-AAAAAA", "m2", "2026-10-17T10:00:00+00:00") });
    state = inboxReducer(state, { type: "read_event", event: { order_number: "BW-AAAAAA", admin_user_id: ANDRE, last_read_at: "2026-10-17T10:00:00+00:00", last_read_message_id: "m2" } });
    assert.equal(state.rows["BW-AAAAAA"].unreadCount, 1, "Andre's read is not Robert's");
    state = inboxReducer(state, { type: "read_event", event: { order_number: "BW-AAAAAA", admin_user_id: ROBERT, last_read_at: "2026-10-17T10:00:00+00:00", last_read_message_id: "m2" } });
    assert.equal(state.rows["BW-AAAAAA"].unreadCount, 0);
  });

  test("a partial read from my other tab marks just that row for exact refetch", () => {
    let state = inboxReducer(base(), { type: "message_event", event: messageEvent("BW-AAAAAA", "m2", "2026-10-17T10:00:00+00:00") });
    state = inboxReducer(state, { type: "read_event", event: { order_number: "BW-AAAAAA", admin_user_id: ROBERT, last_read_at: "2026-10-17T09:30:00+00:00", last_read_message_id: "m1" } });
    assert.deepEqual(state.stale, ["BW-AAAAAA"]);
  });

  test("assignment syncs, and filtered views drop rows that stop matching", () => {
    let state = createInboxState({ me: ROBERT, rows: [inboxRow("BW-AAAAAA")], view: { filter: "unassigned" } });
    state = inboxReducer(state, { type: "conversation_event", event: { order_number: "BW-AAAAAA", assigned_admin_id: ANDRE, assigned_at: "2026-10-17T10:00:00+00:00" } });
    assert.deepEqual(visibleRows(state), [], "assigned away from the Unassigned view");

    let all = createInboxState({ me: ROBERT, rows: [inboxRow("BW-AAAAAA")] });
    all = inboxReducer(all, { type: "conversation_event", event: { order_number: "BW-AAAAAA", assigned_admin_id: ANDRE, assigned_at: "2026-10-17T10:00:00+00:00" } });
    assert.equal(all.rows["BW-AAAAAA"].assignedAdminId, ANDRE);
  });

  test("the open conversation is never yanked out of a filtered list", () => {
    let state = createInboxState({ me: ROBERT, rows: [inboxRow("BW-AAAAAA")], view: { filter: "unassigned" } });
    state = inboxReducer(state, { type: "conversation_event", event: { order_number: "BW-AAAAAA", assigned_admin_id: ANDRE }, activeOrderNumber: "BW-AAAAAA" });
    assert.equal(visibleRows(state).length, 1);
  });

  test("search applies to live insertions too", () => {
    const state = createInboxState({ me: ROBERT, rows: [], view: { search: "juan" } });
    const next = inboxReducer(state, { type: "upsert_row", row: inboxRow("BW-CCCCCC") });
    assert.deepEqual(visibleRows(next), []);
    const match = inboxReducer(state, { type: "upsert_row", row: inboxRow("BW-DDDDDD", { buyerName: "Juan Dela Cruz" }) });
    assert.equal(visibleRows(match).length, 1);
  });
});

// ================================================================== thread
function dto(id, at, overrides = {}) {
  return { id, orderNumber: "BW-AAAAAA", senderRole: "customer", kind: "text", body: id, hasAttachment: false,
    createdAt: at, clientMessageId: null, payment: null, ...overrides };
}

describe("chat thread: sending, retry, reconcile", () => {
  test("optimistic send is replaced by the confirmed message (no duplicate)", () => {
    let state = threadReducer(initialThread, { type: "loaded", messages: [dto("m1", "2026-10-17T10:00:00+00:00")], hasOlder: false });
    state = threadReducer(state, { type: "send", item: { clientMessageId: "c1", kind: "text", body: "hello", createdAt: "x" } });
    assert.equal(state.pending.length, 1);
    state = threadReducer(state, { type: "confirmed", clientMessageId: "c1", message: dto("m2", "2026-10-17T10:01:00+00:00", { clientMessageId: "c1" }) });
    assert.equal(state.pending.length, 0);
    assert.deepEqual(state.messages.map((m) => m.id), ["m1", "m2"]);
  });

  test("double Enter / double click: the same intended message is queued once", () => {
    let state = threadReducer(initialThread, { type: "send", item: { clientMessageId: "c1", kind: "text", body: "hi", createdAt: "x" } });
    state = threadReducer(state, { type: "send", item: { clientMessageId: "c1", kind: "text", body: "hi", createdAt: "x" } });
    assert.equal(state.pending.length, 1);
  });

  test("failed send keeps the text, can retry with the SAME client id", () => {
    let state = threadReducer(initialThread, { type: "send", item: { clientMessageId: "c1", kind: "text", body: "hi", createdAt: "x" } });
    state = threadReducer(state, { type: "failed", clientMessageId: "c1", error: "Network" });
    assert.equal(state.pending[0].status, "failed");
    state = threadReducer(state, { type: "retry", clientMessageId: "c1" });
    assert.equal(state.pending[0].status, "sending");
    assert.equal(state.pending[0].clientMessageId, "c1");
  });

  test("if the realtime fetch delivers my message before the POST response, it still reconciles once", () => {
    let state = threadReducer(initialThread, { type: "send", item: { clientMessageId: "c1", kind: "text", body: "hi", createdAt: "x" } });
    state = threadReducer(state, { type: "received", messages: [dto("m2", "2026-10-17T10:01:00+00:00", { clientMessageId: "c1" })] });
    assert.equal(state.pending.length, 0);
    state = threadReducer(state, { type: "confirmed", clientMessageId: "c1", message: dto("m2", "2026-10-17T10:01:00+00:00", { clientMessageId: "c1" }) });
    assert.deepEqual(state.messages.map((m) => m.id), ["m2"]);
  });

  test("a retried request the server answers with the ORIGINAL row (duplicate id) yields one message", () => {
    let state = threadReducer(initialThread, { type: "confirmed", clientMessageId: "c1", message: dto("m2", "2026-10-17T10:01:00+00:00", { clientMessageId: "c1" }) });
    state = threadReducer(state, { type: "confirmed", clientMessageId: "c1", message: dto("m2", "2026-10-17T10:01:00+00:00", { clientMessageId: "c1" }) });
    assert.equal(state.messages.length, 1);
  });
});

describe("chat thread: pagination and new-message pill", () => {
  test("older pages prepend in exact order without duplicates", () => {
    let state = threadReducer(initialThread, { type: "loaded", messages: [dto("m3", "2026-10-17T10:03:00+00:00"), dto("m4", "2026-10-17T10:04:00+00:00")], hasOlder: true });
    state = threadReducer(state, { type: "loading_older" });
    state = threadReducer(state, { type: "older", messages: [dto("m1", "2026-10-17T10:01:00+00:00"), dto("m2", "2026-10-17T10:02:00+00:00"), dto("m3", "2026-10-17T10:03:00+00:00")], hasOlder: false });
    assert.deepEqual(state.messages.map((m) => m.id), ["m1", "m2", "m3", "m4"]);
    assert.equal(state.hasOlder, false);
    assert.equal(state.loadingOlder, false);
  });

  test("new arrivals from others are counted for the pill; my own are not", () => {
    const prev = [dto("m1", "2026-10-17T10:01:00+00:00")];
    const next = [...prev, dto("m2", "2026-10-17T10:02:00+00:00"), dto("m3", "2026-10-17T10:03:00+00:00"), dto("m4", "2026-10-17T10:04:00+00:00"), dto("m5", "2026-10-17T10:05:00+00:00", { senderRole: "admin" })];
    assert.equal(countNewArrivals(prev, next, (m) => m.senderRole === "admin"), 3, "3 new messages ↓");
  });

  test("opening a chat anchors at the first unread message", () => {
    const messages = [dto("m1", "2026-10-17T10:01:00+00:00"), dto("m2", "2026-10-17T10:02:00+00:00", { senderRole: "admin" }), dto("m3", "2026-10-17T10:03:00+00:00")];
    const isMine = (m) => m.senderRole === "admin";
    assert.equal(findFirstUnreadIndex(messages, { at: "2026-10-17T10:01:00+00:00", messageId: "m1" }, isMine), 2);
    assert.equal(findFirstUnreadIndex(messages, { at: "2026-10-17T10:03:00+00:00", messageId: "m3" }, isMine), -1);
    assert.equal(findFirstUnreadIndex(messages, null, isMine), 0);
  });

  test("seen state follows the other side's read cursor exactly", () => {
    const message = dto("m2", "2026-10-17T10:02:00+00:00", { senderRole: "admin" });
    assert.equal(isSeen(message, { at: "2026-10-17T10:02:00+00:00", messageId: "m2" }), true);
    assert.equal(isSeen(message, { at: "2026-10-17T10:01:00+00:00", messageId: "m1" }), false);
    assert.equal(isSeen(message, null), false);
  });

  test("grouping + date separators (Today / Yesterday / date)", () => {
    const now = Date.parse("2026-10-17T06:00:00+08:00");
    const items = buildDisplayItems([
      dto("a", "2026-10-15T02:00:00+00:00"),
      dto("b", "2026-10-16T02:00:00+00:00", { senderRole: "admin", senderUserId: ROBERT }),
      dto("c", "2026-10-16T02:01:00+00:00", { senderRole: "admin", senderUserId: ROBERT }),
      dto("d", "2026-10-16T02:02:00+00:00", { senderRole: "admin", senderUserId: ANDRE }),
      dto("e", "2026-10-16T21:00:00+00:00"),
    ], { nowMs: now });
    assert.deepEqual(items.filter((i) => i.type === "date").map((i) => i.label), ["Oct 15, 2026", "Yesterday", "Today"]);
    const byId = Object.fromEntries(items.filter((i) => i.type === "message").map((i) => [i.message.id, i]));
    assert.equal(byId.b.firstInGroup, true);
    assert.equal(byId.b.lastInGroup, false, "b and c group");
    assert.equal(byId.c.firstInGroup, false);
    assert.equal(byId.d.firstInGroup, true, "a different admin starts a new group");
  });
});

// ============================================================ quick replies
const replies = [
  { id: "1", shortcut: "was", title: "Payment received", body: "Payment received po! Kindly accept my friend request.", isEnabled: true },
  { id: "2", shortcut: "wait", title: "Please wait", body: "Wait lang po.", isEnabled: true },
  { id: "3", shortcut: "waste", title: "Disabled one", body: "x", isEnabled: false },
  { id: "4", shortcut: "thanks", title: "Thank you", body: "Thank you po, {{customer_name}}!", isEnabled: true },
];

describe("quick replies", () => {
  test("'/' opens the menu at the start or after a space; not inside words", () => {
    assert.deepEqual(detectShortcutQuery("/wa", 3), { start: 0, end: 3, query: "wa" });
    assert.deepEqual(detectShortcutQuery("ok /WAS", 7), { start: 3, end: 7, query: "was" });
    assert.equal(detectShortcutQuery("http://x", 8), null);
    assert.equal(detectShortcutQuery("a/b", 3), null);
    assert.equal(detectShortcutQuery("no slash", 8), null);
  });

  test("matching is case-insensitive and disabled replies never appear", () => {
    assert.deepEqual(filterQuickReplies(replies, "WAS").map((r) => r.shortcut), ["was"]);
    assert.deepEqual(filterQuickReplies(replies, "wa").map((r) => r.shortcut), ["wait", "was"]);
    assert.ok(!filterQuickReplies(replies, "").some((r) => r.shortcut === "waste"));
    assert.deepEqual(filterQuickReplies(replies, "received").map((r) => r.shortcut), ["was"], "title search");
  });

  test("arrow keys move (wrapping), Enter selects, Escape closes until the token changes", () => {
    let menu = quickReplyMenuReducer(closedMenu, { type: "input", text: "/wa", caret: 3, replies });
    assert.equal(menu.open, true);
    assert.equal(selectedReply(menu).shortcut, "wait");
    menu = quickReplyMenuReducer(menu, { type: "key", key: "ArrowDown" });
    assert.equal(selectedReply(menu).shortcut, "was");
    menu = quickReplyMenuReducer(menu, { type: "key", key: "ArrowDown" });
    assert.equal(selectedReply(menu).shortcut, "wait", "wraps");
    menu = quickReplyMenuReducer(menu, { type: "key", key: "ArrowUp" });
    assert.equal(selectedReply(menu).shortcut, "was");
    const escaped = quickReplyMenuReducer(menu, { type: "key", key: "Escape" });
    assert.equal(escaped.open, false);
    assert.equal(quickReplyMenuReducer(escaped, { type: "input", text: "/was", caret: 4, replies }).open, false, "stays closed for this token");
    assert.equal(quickReplyMenuReducer(escaped, { type: "input", text: "/was ok /th", caret: 11, replies }).open, true, "a new token reopens it");
  });

  test("selecting inserts (never sends) and the text stays editable", () => {
    const result = applyQuickReply("Hi /was", { start: 3, end: 7 }, replies[0].body);
    assert.equal(result.text, "Hi Payment received po! Kindly accept my friend request.");
    assert.equal(result.caret, result.text.length);
  });

  test("variables: only the four whitelisted names, as plain text", () => {
    assert.equal(renderTemplate("Thank you po, {{customer_name}}! Order {{ order_number }} ({{total}})", { customer_name: "Juan", order_number: "BW-1", total: "₱250" }), "Thank you po, Juan! Order BW-1 (₱250)");
    assert.equal(renderTemplate("{{constructor}} {{__proto__}} {{process.env.KEY}} {{ total }}", { total: "₱1" }), "{{constructor}} {{__proto__}} {{process.env.KEY}} ₱1");
    assert.equal(renderTemplate("{{customer_name}}", { customer_name: "<img src=x onerror=alert(1)>" }), "<img src=x onerror=alert(1)>", "inserted as text; rendering never uses HTML");
    assert.equal(renderTemplate("Hi {{customer_name}}", {}), "Hi {{customer_name}}", "missing values are left visible, not blanked");
  });
});

// ============================================================ order details
describe("order details panel data", () => {
  const details = buildOrderDetails({
    snapshot: { order_number: "BW-ABC123", buyer_name: "Juan Dela Cruz", buyer_roblox_username: "Juan123", total_amount: "1250.00", created_at: "2026-10-17T10:00:00+00:00" },
    lines: [
      { line_index: 2, game_id: VIA_LINK, game_name: "Robux (Via Link)", product_name: "1,000 Robux", quantity: 1, robux_amount: 1000, unit_price: "1000", line_total: "1000", is_via_plus: false },
      { line_index: 0, game_id: "bf", game_name: "Blox Fruits", product_name: "Money", quantity: 2, robux_amount: 450, unit_price: "62.5", line_total: "125", is_via_plus: false },
      { line_index: 1, game_id: "bf", game_name: "Blox Fruits", product_name: "Mastery", quantity: 2, robux_amount: 450, unit_price: "62.5", line_total: "125", is_via_plus: false },
    ],
    viaPlus: null,
    fulfillmentRows: [],
    status: "pending",
    conversation: { id: "conv-1", assigned_admin_id: ROBERT, payment_details_sent_at: null },
    customerEmail: "juan@gmail.test",
  });

  test("customer, Roblox username, order, total, status, assignee", () => {
    assert.deepEqual(details.customer, { name: "Juan Dela Cruz", robloxUsername: "Juan123", email: "juan@gmail.test" });
    assert.equal(details.order.orderNumber, "BW-ABC123");
    assert.equal(details.order.total, 1250);
    assert.equal(details.order.status, "pending");
    assert.equal(details.order.assignedAdminId, ROBERT);
  });

  test("items grouped by game, with product, quantity, Robux, unit price and line total", () => {
    assert.deepEqual(details.groups.map((g) => g.gameName), ["Blox Fruits", "Robux (Via Link)"]);
    assert.deepEqual(
      details.groups[0].lines.map((l) => [l.productName, l.quantity, l.robuxAmount, l.unitPrice, l.lineTotal]),
      [["Money", 2, 450, 62.5, 125], ["Mastery", 2, 450, 62.5, 125]],
    );
  });

  test("Via Link line shows its gamepass link slot as waiting until the customer submits it", () => {
    const via = details.groups[1].lines[0];
    assert.equal(via.totalRobux, 1000);
    assert.deepEqual(via.fulfillment.map((s) => [s.label, s.status]), [["Gamepass Link", "waiting"]]);
    assert.equal(details.fulfillmentPending, 1);
  });

  test("Via Plus details come from their own structured record", () => {
    const withPlus = buildOrderDetails({
      snapshot: { order_number: "BW-1", buyer_name: "A", buyer_roblox_username: "a", total_amount: 1, created_at: "2026-10-17T10:00:00+00:00" },
      lines: [], viaPlus: { roblox_display_name: "Aa", age_16_confirmed: true, verified_account_confirmed: true, via_plus_robux_amount: 800 },
      fulfillmentRows: [], status: null, conversation: null, customerEmail: null,
    });
    assert.deepEqual(withPlus.viaPlus, { robloxDisplayName: "Aa", age16Confirmed: true, verifiedAccountConfirmed: true, robuxAmount: 800 });
    assert.equal(withPlus.order.status, "pending");
  });

  test("the builder has no access to chat messages at all", () => {
    assert.equal(buildOrderDetails.length, 1);
    assert.equal(JSON.stringify(details).includes("slip"), false);
  });
});

// ============================================================ CSRF guard
describe("same-origin guard for cookie-authenticated writes", () => {
  test("allows same-site requests, incl. behind a proxy or dev server", () => {
    assert.equal(isSameOrigin({ origin: "https://budgetwiseshop.com", host: "budgetwiseshop.com", forwardedHost: null, requestUrl: "https://budgetwiseshop.com/api/x" }), true);
    assert.equal(isSameOrigin({ origin: "https://budgetwiseshop.com", host: "internal:3000", forwardedHost: "budgetwiseshop.com", requestUrl: "http://internal:3000/api/x" }), true);
    assert.equal(isSameOrigin({ origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100", forwardedHost: null, requestUrl: "http://localhost:3100/api/x" }), true);
    assert.equal(isSameOrigin({ origin: null, host: "budgetwiseshop.com", forwardedHost: null, requestUrl: "https://budgetwiseshop.com/api/x" }), true, "no Origin = not a cross-site browser request");
  });
  test("refuses other sites and malformed origins", () => {
    assert.equal(isSameOrigin({ origin: "https://evil.example", host: "budgetwiseshop.com", forwardedHost: null, requestUrl: "https://budgetwiseshop.com/api/x" }), false);
    assert.equal(isSameOrigin({ origin: "https://budgetwiseshop.com.evil.example", host: "budgetwiseshop.com", forwardedHost: null, requestUrl: "https://budgetwiseshop.com/api/x" }), false);
    assert.equal(isSameOrigin({ origin: "null", host: "budgetwiseshop.com", forwardedHost: null, requestUrl: "https://budgetwiseshop.com/api/x" }), false);
  });
});
