// Phase 3 (0032): reactions, replies and typing — the pure logic both chats
// share. The database rules are in supabase/tests/35_*.
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  REACTIONS,
  applyMyReaction,
  isReactionKey,
  quotePreview,
  quotePreviewFromDto,
  reactionsFromEvent,
  summarizeReactions,
} from "../src/lib/chat/message-meta.mjs";
import { toChatMessage } from "../src/lib/chat/dto.mjs";
import { threadReducer, initialThread } from "../src/lib/chat/thread-state.mjs";
import { applySignal, describeConversationPresence, emptyPresence, prunePresence, TYPING_TTL_MS } from "../src/lib/chat/presence-state.mjs";
import { createSignalHandler } from "../src/lib/chat/signals.mjs";

const TWICKS = "00000000-0000-0000-0000-0000000000a2";
const AKIO = "00000000-0000-0000-0000-0000000000a3";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";
const directory = {
  [TWICKS]: { displayName: "Andre", publicUsername: "Twicks" },
  [AKIO]: { displayName: "Kenneth", publicUsername: "Akio" },
};

describe("reactions", () => {
  test("the five standard reactions, as stable keys", () => {
    assert.deepEqual(REACTIONS.map((r) => r.key), ["love", "haha", "sad", "wow", "like"]);
    assert.deepEqual(REACTIONS.map((r) => r.emoji), ["❤️", "😂", "😢", "😮", "👍"]);
    assert.equal(isReactionKey("angry"), false);
  });

  test("rows aggregate per message with my own choice", () => {
    const map = summarizeReactions(
      [
        { message_id: "m1", actor_user_id: CUSTOMER, reaction: "love" },
        { message_id: "m1", actor_user_id: TWICKS, reaction: "love" },
        { message_id: "m1", actor_user_id: AKIO, reaction: "like" },
        { message_id: "m2", actor_user_id: AKIO, reaction: "bogus" },
      ],
      TWICKS,
    );
    assert.deepEqual(map.get("m1"), { counts: { love: 2, like: 1 }, mine: "love" });
    assert.equal(map.has("m2"), false, "unknown reactions are dropped");
  });

  test("tap to add, tap again to remove, or switch (one per person)", () => {
    let r = applyMyReaction(null, "love");
    assert.deepEqual(r, { counts: { love: 1 }, mine: "love" });
    r = applyMyReaction({ counts: { love: 2 }, mine: "love" }, "haha");
    assert.deepEqual(r, { counts: { love: 1, haha: 1 }, mine: "haha" });
    assert.equal(applyMyReaction({ counts: { haha: 1 }, mine: "haha" }, null), null);
  });

  test("live events: customers see counts + their own; each admin sees their own", () => {
    const payload = { message_id: "m1", counts: { like: 2, love: 1 }, customer: "love", admins: { [TWICKS]: "like", [AKIO]: "like" } };
    assert.deepEqual(reactionsFromEvent(payload, { viewer: "customer" }), { counts: { love: 1, like: 2 }, mine: "love" });
    assert.deepEqual(reactionsFromEvent(payload, { viewer: "admin", me: TWICKS }).mine, "like");
    assert.equal(reactionsFromEvent({ counts: {} }, { viewer: "customer" }), null);
  });

  test("reactions never touch the thread's read / unread inputs", () => {
    const message = { id: "m1", senderRole: "admin", kind: "text", body: "hi", createdAt: "2026-10-19T10:00:00Z", reactions: null };
    const state = threadReducer({ ...initialThread, messages: [message], loaded: true }, {
      type: "patch_message", messageId: "m1", patch: { reactions: { counts: { love: 1 }, mine: "love" } },
    });
    assert.equal(state.messages.length, 1);
    assert.equal(state.messages[0].createdAt, message.createdAt);
    assert.deepEqual(state.messages[0].reactions, { counts: { love: 1 }, mine: "love" });
    assert.equal(threadReducer(state, { type: "patch_message", messageId: "nope", patch: {} }), state);
  });
});

describe("reply quotes", () => {
  test("safe summaries — never amounts, account numbers or file paths", () => {
    assert.equal(quotePreview({ kind: "text", body: "  How long  is delivery?  " }), "How long is delivery?");
    assert.equal(quotePreview({ kind: "text", body: "x".repeat(300) }).length, 120);
    assert.equal(quotePreview({ kind: "image", body: "caption", attachment_path: "BW-1/u/secret.jpg" }), "Photo");
    assert.equal(quotePreview({ kind: "album", payload: null }, { albumCount: 3 }), "3 photos");
    assert.equal(quotePreview({ kind: "album", payload: { label: "proof_of_delivery" } }, { albumCount: 1 }), "Proof of delivery · Photo");
    assert.equal(quotePreview({ kind: "payment", body: "GCash payment details. Amount: PHP 499.50. Account: B W (0917...)" }), "Payment details");
    assert.equal(quotePreview({ kind: "slip", body: "ORDER SLIP ..." }), "Order placed");
    assert.equal(quotePreviewFromDto({ kind: "album", body: "", album: { label: null, items: [{}, {}] } }), "2 photos");
  });

  test("the quote carries no admin id or private data for customers", () => {
    const target = {
      id: "t1", order_number: "BW-1", sender_role: "admin", sender_user_id: AKIO, kind: "payment",
      body: "GCash payment details. Amount: PHP 499.50. Account: B W (09170000031).", created_at: "2026-10-19T10:00:00Z",
      payload: { account_number: "09170000031", qr_path: "qr/secret.png" },
    };
    const reply = { id: "r1", order_number: "BW-1", sender_role: "customer", sender_user_id: CUSTOMER, kind: "text", body: "Paid!", created_at: "2026-10-19T10:01:00Z", reply_to_message_id: "t1" };
    const customerDto = toChatMessage(reply, {
      viewer: "customer", viewerUserId: CUSTOMER, replyTargets: new Map([["t1", target]]), publicNames: new Map([[AKIO, "Akio"]]),
    });
    assert.deepEqual(customerDto.replyTo, { id: "t1", senderRole: "admin", kind: "payment", preview: "Payment details", senderName: "Akio" });
    const wire = JSON.stringify(customerDto);
    for (const secret of [AKIO, "09170000031", "qr/secret.png", "499.50"]) assert.equal(wire.includes(secret), false, secret);

    const adminDto = toChatMessage(reply, { viewer: "admin", replyTargets: new Map([["t1", target]]) });
    assert.equal(adminDto.replyTo.senderUserId, AKIO);
  });

  test("a reply whose original is unavailable shows no quote instead of failing", () => {
    const reply = { id: "r1", order_number: "BW-1", sender_role: "customer", kind: "text", body: "?", created_at: "x", reply_to_message_id: "gone" };
    assert.equal(toChatMessage(reply, { viewer: "customer", replyTargets: new Map() }).replyTo, null);
    assert.equal(toChatMessage({ ...reply, reply_to_message_id: null }, { viewer: "customer" }).replyTo, null);
  });
});

describe("typing", () => {
  const now = 1_000_000;

  test("customer typing is shown to admins, separately from admins typing", () => {
    let state = applySignal(emptyPresence, { type: "customer_typing", order_number: "BW-1" }, now);
    state = applySignal(state, { type: "typing", admin_user_id: AKIO, order_number: "BW-1" }, now);
    const seenByTwicks = describeConversationPresence(state, "BW-1", { me: TWICKS, directory, nowMs: now + 10 });
    assert.equal(seenByTwicks.customerTyping, true);
    assert.deepEqual(seenByTwicks.typers, ["Akio"], "public usernames, never counting the customer as an admin");
    assert.match(seenByTwicks.text, /^Customer is typing · Akio is typing/);
    const seenByAkio = describeConversationPresence(state, "BW-1", { me: AKIO, directory, nowMs: now + 10 });
    assert.deepEqual(seenByAkio.typers, [], "never my own typing");
    assert.equal(describeConversationPresence(state, "BW-2", { me: TWICKS, directory, nowMs: now }).customerTyping, false);
  });

  test("stops on 'stopped' and expires on its own", () => {
    let state = applySignal(emptyPresence, { type: "customer_typing", order_number: "BW-1" }, now);
    assert.equal(describeConversationPresence(applySignal(state, { type: "customer_stopped", order_number: "BW-1" }, now), "BW-1", { me: TWICKS, directory, nowMs: now }).customerTyping, false);
    state = prunePresence(state, now + TYPING_TTL_MS + 1);
    assert.equal(describeConversationPresence(state, "BW-1", { me: TWICKS, directory, nowMs: now + TYPING_TTL_MS + 1 }).customerTyping, false);
  });

  test("admin typing also notifies the customer, and that can never break the signal", async () => {
    const published = [];
    const told = [];
    const handler = createSignalHandler({
      resolveAdmin: async () => ({ id: AKIO }),
      publish: async (event) => published.push(event),
      limiter: { take: () => ({ ok: true }) },
      afterPublish: async (event) => {
        told.push(event.type);
        throw new Error("realtime down");
      },
    });
    const result = await handler({ type: "typing", orderNumber: "BW-1", admin_user_id: TWICKS });
    assert.equal(result.status, 202);
    assert.equal(published[0].admin_user_id, AKIO, "identity from the session, never the body");
    assert.deepEqual(told, ["typing"]);
  });
});
