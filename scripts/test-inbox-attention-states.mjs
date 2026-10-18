// 0030: Unopened / Seen · No reply / Replied across three admins' inboxes,
// driven by the realtime events each browser receives. Database filters are
// in supabase/tests/33_*.
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createInboxState, inboxReducer, visibleRows } from "../src/lib/chat/inbox-state.mjs";
import { attentionState } from "../src/lib/chat/inbox-attention.mjs";

const TWICKS = "00000000-0000-0000-0000-0000000000a2";
const ZUNO = "00000000-0000-0000-0000-0000000000a1";
const AKIO = "00000000-0000-0000-0000-0000000000a3";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";

let clock = Date.parse("2026-10-19T10:00:00Z");
const nextAt = () => new Date((clock += 1000)).toISOString().replace("Z", "000+00:00");

function baseRow(orderNumber) {
  return {
    conversationId: "c-" + orderNumber, orderNumber, buyerName: "Buyer", buyerRobloxUsername: "rbx", totalAmount: 100,
    orderCreatedAt: "2026-10-19T09:00:00.000000+00:00", orderStatus: "pending", assignedAdminId: null, assignedAt: null,
    lastMessageId: "seed", lastMessageAt: "2026-10-19T09:00:00.000000+00:00", lastMessageKind: "text",
    lastMessagePreview: "", lastSenderRole: "admin", customerReadAt: null, customerReadMessageId: null,
    paymentDetailsSentAt: null, myReadAt: null, myReadMessageId: null, unreadCount: 0, state: "active",
    doneAt: null, doneBy: null, paymentRequestMessageId: null, paymentReceivedMessageId: null, paymentReceivedAt: null,
    paymentReceivedBy: null, lastCustomerMessageAt: null, lastCustomerMessageId: null, lastAdminReplyAt: null,
    lastAdminReplyId: null, lastAdminReplyBy: null, viewedBy: [], avatarSeed: "0123456789abcdef", avatarPhotoUrl: null,
    gameIds: [], gameNames: [],
  };
}

function inboxes(row, filter = "active") {
  return Object.fromEntries([TWICKS, ZUNO, AKIO].map((me) => [me, createInboxState({ me, rows: [row], view: { filter } })]));
}
const all = (boxes, action) => {
  for (const me of Object.keys(boxes)) boxes[me] = inboxReducer(boxes[me], action);
};
const states = (boxes, key) => Object.values(boxes).map((box) => attentionState(box.rows[key]));

function message(key, sender_role, sender_user_id, kind = "text", state = "active") {
  const created_at = nextAt();
  const id = `m${clock}`;
  return {
    type: "message_event",
    event: {
      conversation_id: "c-" + key, order_number: key, is_new_conversation: false,
      message: { id, sender_role, sender_user_id, kind, created_at, client_message_id: null },
      row: { last_message_id: id, last_message_at: created_at, last_message_kind: kind, last_message_preview: kind,
        last_sender_role: sender_role, payment_details_sent_at: null, state },
    },
    activeOrderNumber: null,
  };
}
const read = (key, admin, msg) => ({
  type: "read_event",
  event: { order_number: key, admin_user_id: admin, last_read_at: msg.event.message.created_at, last_read_message_id: msg.event.message.id },
  activeOrderNumber: null,
});

for (const key of ["BW-STATE30", "GI-1A2B3C4D"]) {
  describe(`attention states (${key.startsWith("GI-") ? "General Inquiry" : "order chat"})`, () => {
    test("Unopened → Seen · No reply → Replied → Unopened, live for all three admins", () => {
      const boxes = inboxes(baseRow(key));
      assert.deepEqual(states(boxes, key), ["quiet", "quiet", "quiet"], "nothing from the customer yet: never urgent");

      const first = message(key, "customer", CUSTOMER, key.startsWith("GI-") ? "text" : "slip");
      all(boxes, first);
      assert.deepEqual(states(boxes, key), ["unopened", "unopened", "unopened"]);

      // Assignment and payment details are not viewing or replying.
      all(boxes, { type: "conversation_event", event: { conversation_id: "c", order_number: key, assigned_admin_id: TWICKS,
        assigned_by: ZUNO, assigned_at: nextAt(), customer_read_at: null, customer_read_message_id: null,
        admin_read_at: null, admin_read_message_id: null, state: "active" } });
      all(boxes, message(key, "admin", ZUNO, "payment"));
      assert.deepEqual(states(boxes, key), ["unopened", "unopened", "unopened"], "assignment / payment card change nothing");

      all(boxes, read(key, AKIO, first));
      assert.deepEqual(states(boxes, key), ["seen", "seen", "seen"], "Akio opened it: Seen for everyone");
      assert.deepEqual(boxes[TWICKS].rows[key].viewedBy, [AKIO], "Viewed by Akio");
      assert.equal(boxes[TWICKS].rows[key].unreadCount, 1, "Twicks' personal unread is untouched");

      all(boxes, message(key, "admin", AKIO));
      assert.deepEqual(states(boxes, key), ["replied", "replied", "replied"], "Akio replied");
      assert.equal(boxes[TWICKS].rows[key].lastAdminReplyBy, AKIO);
      assert.equal(boxes[TWICKS].rows[key].unreadCount, 1, "still unread for Twicks personally");

      all(boxes, message(key, "customer", CUSTOMER));
      assert.deepEqual(states(boxes, key), ["unopened", "unopened", "unopened"], "a follow-up resets to Unopened");
      assert.deepEqual(boxes[ZUNO].rows[key].viewedBy, []);
    });
  });
}

describe("attention filters update live", () => {
  test("a row leaves Unopened and enters Seen, no reply when another admin reads it", () => {
    const key = "BW-FILT30";
    const first = message(key, "customer", CUSTOMER);
    const row = { ...baseRow(key), lastMessageId: first.event.message.id, lastMessageAt: first.event.message.created_at,
      lastCustomerMessageId: first.event.message.id, lastCustomerMessageAt: first.event.message.created_at, unreadCount: 1 };
    let unopenedView = createInboxState({ me: TWICKS, rows: [row], view: { filter: "unopened" } });
    assert.equal(visibleRows(unopenedView).length, 1);
    unopenedView = inboxReducer(unopenedView, read(key, AKIO, first));
    assert.equal(visibleRows(unopenedView).length, 0, "Akio read it: it leaves Unopened for Twicks");
    let seenView = createInboxState({ me: TWICKS, rows: [{ ...row, viewedBy: [AKIO] }], view: { filter: "seen_no_reply" } });
    assert.equal(visibleRows(seenView).length, 1);
    seenView = inboxReducer(seenView, message(key, "admin", AKIO));
    assert.equal(visibleRows(seenView).length, 0, "answered: it leaves Seen, no reply");
  });

  test("the open chat is never yanked out of a filter by someone else's read", () => {
    const key = "BW-OPEN30";
    const first = message(key, "customer", CUSTOMER);
    const row = { ...baseRow(key), lastCustomerMessageId: first.event.message.id, lastCustomerMessageAt: first.event.message.created_at };
    let view = createInboxState({ me: TWICKS, rows: [row], view: { filter: "unopened" } });
    view = inboxReducer(view, { ...read(key, AKIO, first), activeOrderNumber: key });
    assert.equal(visibleRows(view).length, 1);
  });

  test("Done is its own muted state", () => {
    assert.equal(attentionState({ ...baseRow("BW-DONE30"), state: "done", lastCustomerMessageId: "x", lastCustomerMessageAt: "2026-10-19T09:00:00Z" }), "done");
  });
});
