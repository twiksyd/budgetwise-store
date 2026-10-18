// Admin inbox clarity (0028): Unread / Needs reply / Replied by / Viewed by
// across three admins' inboxes, driven by the same realtime events each
// admin's browser receives. The database rules are in supabase/tests/31_*.
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createInboxState, inboxReducer, isPaymentReceived, matchesView } from "../src/lib/chat/inbox-state.mjs";
import {
  attentionLevel,
  isAdminReply,
  isNewAttention,
  needsReply,
  repliedBy,
  viewedByOthers,
} from "../src/lib/chat/inbox-attention.mjs";

const TWICKS = "00000000-0000-0000-0000-0000000000a2";
const ZUNO = "00000000-0000-0000-0000-0000000000a1";
const AKIO = "00000000-0000-0000-0000-0000000000a3";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";
const ORDER = "BW-INB028";

let clock = Date.parse("2026-10-18T10:00:00Z");
const nextAt = () => new Date((clock += 1000)).toISOString().replace("Z", "000+00:00");

const emptyRow = {
  conversationId: "c1",
  orderNumber: ORDER,
  buyerName: "Inbox Buyer",
  buyerRobloxUsername: "inbRBX",
  totalAmount: 300,
  orderCreatedAt: "2026-10-18T09:59:00.000000+00:00",
  orderStatus: "pending",
  assignedAdminId: null,
  assignedAt: null,
  lastMessageId: "m0",
  lastMessageAt: "2026-10-18T09:59:00.000000+00:00",
  lastMessageKind: "slip",
  lastMessagePreview: "Order placed",
  lastSenderRole: "customer",
  customerReadAt: null,
  customerReadMessageId: null,
  paymentDetailsSentAt: null,
  myReadAt: null,
  myReadMessageId: null,
  unreadCount: 1,
  state: "active",
  doneAt: null,
  doneBy: null,
  paymentRequestMessageId: null,
  paymentReceivedMessageId: null,
  paymentReceivedAt: null,
  paymentReceivedBy: null,
  lastCustomerMessageAt: "2026-10-18T09:59:00.000000+00:00",
  lastCustomerMessageId: "m0",
  lastAdminReplyAt: null,
  lastAdminReplyId: null,
  lastAdminReplyBy: null,
  viewedBy: [],
};

/** Three admins' inboxes, all loaded from the same server row. */
function threeInboxes(row = emptyRow) {
  return Object.fromEntries([TWICKS, ZUNO, AKIO].map((me) => [me, createInboxState({ me, rows: [row], view: { filter: "active" } })]));
}
const everyone = (inboxes, action) => {
  for (const me of Object.keys(inboxes)) inboxes[me] = inboxReducer(inboxes[me], action);
};
const rowOf = (inboxes, me) => inboxes[me].rows[ORDER];

function message(sender_role, sender_user_id, kind = "text") {
  const created_at = nextAt();
  const id = `m${clock}`;
  return {
    type: "message_event",
    event: {
      conversation_id: "c1",
      order_number: ORDER,
      is_new_conversation: false,
      message: { id, sender_role, sender_user_id, kind, created_at, client_message_id: null },
      row: {
        last_message_id: id,
        last_message_at: created_at,
        last_message_kind: kind,
        last_message_preview: kind,
        last_sender_role: sender_role,
        payment_details_sent_at: null,
        state: "active",
      },
    },
    activeOrderNumber: null,
  };
}
const readBy = (admin, row) => ({
  type: "read_event",
  event: { order_number: ORDER, admin_user_id: admin, last_read_at: row.lastMessageAt, last_read_message_id: row.lastMessageId },
});

describe("inbox clarity: rules", () => {
  test("a payment card and an order slip are not admin replies; text, photos and albums are", () => {
    assert.equal(isAdminReply({ sender_role: "admin", kind: "text" }), true);
    assert.equal(isAdminReply({ sender_role: "admin", kind: "album" }), true);
    assert.equal(isAdminReply({ sender_role: "admin", kind: "image" }), true);
    assert.equal(isAdminReply({ sender_role: "admin", kind: "payment" }), false);
    assert.equal(isAdminReply({ sender_role: "customer", kind: "slip" }), false);
    assert.equal(isAdminReply({ sender_role: "customer", kind: "text" }), false);
  });

  test("an inquiry nobody wrote in has no customer activity: nothing needs a reply", () => {
    assert.equal(needsReply({ ...emptyRow, lastCustomerMessageId: null, lastCustomerMessageAt: null }), false);
  });

  test("the Needs reply view is part of the Active queue", () => {
    const view = { filter: "needs_reply", search: "" };
    assert.equal(matchesView(emptyRow, view, TWICKS), true);
    assert.equal(matchesView({ ...emptyRow, state: "done" }, view, TWICKS), false);
  });
});

describe("inbox clarity: three admins", () => {
  test("F: a new order is New for everyone; Zuno opening it stops New without marking it replied", () => {
    const inboxes = threeInboxes();
    for (const me of [TWICKS, ZUNO, AKIO]) {
      assert.equal(isNewAttention(rowOf(inboxes, me)), true);
      assert.equal(attentionLevel(rowOf(inboxes, me), me), "high");
    }
    everyone(inboxes, readBy(ZUNO, emptyRow));
    assert.equal(isNewAttention(rowOf(inboxes, TWICKS)), false, "acknowledged: no longer New");
    assert.equal(needsReply(rowOf(inboxes, TWICKS)), true, "C: viewing is not replying");
    assert.deepEqual(viewedByOthers(rowOf(inboxes, TWICKS), TWICKS), [ZUNO], "C: Viewed by Zuno");
    assert.deepEqual(viewedByOthers(rowOf(inboxes, ZUNO), ZUNO), [], "Zuno never sees themself listed");
    assert.equal(rowOf(inboxes, TWICKS).unreadCount, 1, "Zuno's read never clears Twicks' unread");
    assert.equal(rowOf(inboxes, ZUNO).unreadCount, 0, "Zuno's own read clears Zuno's unread");
    assert.equal(attentionLevel(rowOf(inboxes, AKIO), AKIO), "high", "Akio still has it unread");
  });

  test("A / D / E: Akio replies to a chat assigned to Twicks", () => {
    const inboxes = threeInboxes({ ...emptyRow, assignedAdminId: TWICKS });
    everyone(inboxes, message("admin", AKIO));
    for (const me of [TWICKS, ZUNO, AKIO]) {
      assert.equal(needsReply(rowOf(inboxes, me)), false, "A: nobody sees Needs reply");
      assert.equal(repliedBy(rowOf(inboxes, me)), AKIO, "A: Replied by Akio");
      assert.equal(rowOf(inboxes, me).assignedAdminId, TWICKS, "D: assignment stays Twicks");
    }
    assert.equal(rowOf(inboxes, TWICKS).unreadCount, 1, "E: Twicks' personal unread is separate");
    assert.equal(attentionLevel(rowOf(inboxes, TWICKS), TWICKS), "medium", "E: replied but unread = medium");
    everyone(inboxes, readBy(TWICKS, rowOf(inboxes, TWICKS)));
    assert.equal(attentionLevel(rowOf(inboxes, TWICKS), TWICKS), "low", "replied and read = low");
  });

  test("B: the customer writes again (twice): Needs reply for everyone; viewers reset", () => {
    const inboxes = threeInboxes();
    everyone(inboxes, readBy(ZUNO, emptyRow));
    everyone(inboxes, message("admin", AKIO));
    everyone(inboxes, message("customer", CUSTOMER));
    const second = message("customer", CUSTOMER);
    everyone(inboxes, second);
    for (const me of [TWICKS, ZUNO, AKIO]) {
      assert.equal(needsReply(rowOf(inboxes, me)), true);
      assert.equal(repliedBy(rowOf(inboxes, me)), null, "no stale Replied by");
      assert.equal(rowOf(inboxes, me).lastCustomerMessageId, second.event.message.id);
      assert.deepEqual(rowOf(inboxes, me).viewedBy, [], "nobody has viewed the new messages yet");
    }
    assert.equal(isNewAttention(rowOf(inboxes, TWICKS)), false, "answered before: Needs reply, not New");
  });

  test("a payment card does not answer; a proof album does; duplicate events change nothing", () => {
    const inboxes = threeInboxes();
    everyone(inboxes, message("admin", ZUNO, "payment"));
    assert.equal(needsReply(rowOf(inboxes, TWICKS)), true);
    const album = message("admin", TWICKS, "album");
    everyone(inboxes, album);
    assert.equal(repliedBy(rowOf(inboxes, AKIO)), TWICKS);
    const before = inboxes[AKIO];
    everyone(inboxes, album); // the same event again (reconnect, two tabs)
    assert.equal(inboxes[AKIO], before);
  });

  test("G: a Done chat with a new customer message is Active and Needs reply again", () => {
    const inboxes = threeInboxes({ ...emptyRow, state: "done", lastAdminReplyAt: "2026-10-18T09:59:30.000000+00:00", lastAdminReplyId: "r0", lastAdminReplyBy: AKIO });
    assert.equal(needsReply(rowOf(inboxes, TWICKS)), false, "Done never shows Needs reply");
    everyone(inboxes, message("customer", CUSTOMER));
    // The database reopens it; the message event carries state 'active'.
    assert.equal(rowOf(inboxes, TWICKS).state, "active");
    assert.equal(needsReply(rowOf(inboxes, TWICKS)), true);
  });

  test("H: Payment Received changes neither the reply nor the read state", () => {
    const inboxes = threeInboxes({ ...emptyRow, paymentRequestMessageId: "p1" });
    const before = { ...rowOf(inboxes, TWICKS) };
    everyone(inboxes, {
      type: "conversation_event",
      event: {
        conversation_id: "c1", order_number: ORDER, assigned_admin_id: null, assigned_by: null, assigned_at: null,
        customer_read_at: null, customer_read_message_id: null, admin_read_at: null, admin_read_message_id: null,
        state: "active", done_at: null, done_by: null,
        payment_request_message_id: "p1", payment_received_message_id: "p1", payment_received_at: "t", payment_received_by: AKIO,
      },
    });
    const after = rowOf(inboxes, TWICKS);
    assert.equal(isPaymentReceived(after), true);
    assert.equal(needsReply(after), needsReply(before));
    assert.equal(after.unreadCount, before.unreadCount);
    assert.deepEqual(after.viewedBy, before.viewedBy);
    assert.equal(after.lastAdminReplyId, before.lastAdminReplyId);
  });
});
