// Payment Received (0027): DTO shape, inbox state, and which card the UI
// offers / re-reads. The database side (authorization, idempotency,
// concurrency, audit, XOB untouched) is in supabase/tests/29_*.
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { toChatMessage, toPaymentReceived } from "../src/lib/chat/dto.mjs";
import { createInboxState, inboxReducer, isPaymentReceived } from "../src/lib/chat/inbox-state.mjs";
import {
  confirmablePaymentId,
  latestPaymentReceived,
  paymentMessageToRefresh,
} from "../src/lib/chat/payment-received.mjs";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const OTHER_ADMIN = "00000000-0000-0000-0000-0000000000a2";
const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";

const paymentRow = (id, created_at = "2026-10-18T10:00:00.000000+00:00") => ({
  id,
  order_number: "BW-PAY027",
  sender_role: "admin",
  sender_user_id: ADMIN,
  kind: "payment",
  body: "GCash payment details",
  payload: { provider: "gcash", label: "GCash", account_name: "B W", account_number: "09170000027", amount: 250, has_qr: false, qr_path: "secret/qr.png", method_id: "m" },
  created_at,
});

describe("payment received: message DTO", () => {
  const confirmation = { message_id: "p2", confirmed_at: "2026-10-18T10:05:00.123456+00:00", confirmed_by: ADMIN };
  const confirmations = new Map([["p2", confirmation]]);

  test("customers see that it was verified and when, never which admin", () => {
    const dto = toChatMessage(paymentRow("p2"), { viewer: "customer", viewerUserId: CUSTOMER, paymentConfirmations: confirmations });
    assert.deepEqual(dto.paymentReceived, { confirmedAt: confirmation.confirmed_at });
    assert.equal(JSON.stringify(dto).includes(ADMIN), false);
  });

  test("admins also see who confirmed it", () => {
    const dto = toChatMessage(paymentRow("p2"), { viewer: "admin", paymentConfirmations: confirmations });
    assert.deepEqual(dto.paymentReceived, { confirmedAt: confirmation.confirmed_at, confirmedBy: ADMIN });
  });

  test("an unconfirmed card, and every non-payment message, has no confirmation", () => {
    assert.equal(toChatMessage(paymentRow("p1"), { viewer: "customer", paymentConfirmations: confirmations }).paymentReceived, null);
    const receipt = { ...paymentRow("p2"), kind: "image", sender_role: "customer", sender_user_id: CUSTOMER, payload: null, attachment_path: "x.jpg" };
    // Even a receipt whose id somehow matched a confirmation is never "received".
    assert.equal(toChatMessage(receipt, { viewer: "admin", paymentConfirmations: confirmations }).paymentReceived, null);
    assert.equal(toPaymentReceived(undefined, "admin"), null);
    assert.equal(toPaymentReceived({ message_id: "x" }, "admin"), null);
  });

  test("payment card details stay whitelisted (no QR path or method id)", () => {
    const dto = toChatMessage(paymentRow("p2"), { viewer: "customer", paymentConfirmations: confirmations });
    assert.equal(JSON.stringify(dto).includes("secret/qr.png"), false);
    assert.equal(dto.payment.accountNumber, "09170000027");
  });
});

describe("payment received: which card", () => {
  const pending = (id) => ({ id, kind: "payment", paymentReceived: null });
  const done = (id) => ({ id, kind: "payment", paymentReceived: { confirmedAt: "t" } });
  const text = (id) => ({ id, kind: "text", paymentReceived: null });

  test("only the latest payment card is confirmable", () => {
    assert.equal(confirmablePaymentId([text("a"), pending("p1"), text("b"), pending("p2"), text("c")], null), "p2");
    assert.equal(confirmablePaymentId([pending("p1"), text("b")], "p1"), "p1");
  });

  test("nothing is confirmable without payment details, or once the latest is confirmed", () => {
    assert.equal(confirmablePaymentId([text("a")], null), null);
    assert.equal(confirmablePaymentId([], null), null);
    assert.equal(confirmablePaymentId([pending("p1"), done("p2")], "p2"), null);
  });

  test("when the server knows a newer card than the one loaded, an older card is never offered", () => {
    assert.equal(confirmablePaymentId([pending("p1")], "p2"), null);
  });

  test("a confirmed card still shown unconfirmed is re-read once; others are left alone", () => {
    assert.equal(paymentMessageToRefresh([pending("p1"), pending("p2")], "p2"), "p2");
    assert.equal(paymentMessageToRefresh([done("p2")], "p2"), null);
    assert.equal(paymentMessageToRefresh([pending("p1")], "p9"), null); // not loaded: nothing to fetch
    assert.equal(paymentMessageToRefresh([text("p2")], "p2"), null);
    assert.equal(paymentMessageToRefresh([pending("p1")], null), null);
  });

  test("the customer notice follows the latest card", () => {
    assert.equal(latestPaymentReceived([done("p1")]), true);
    assert.equal(latestPaymentReceived([done("p1"), pending("p2")]), false);
    assert.equal(latestPaymentReceived([text("a")]), false);
  });
});

describe("payment received: inbox", () => {
  const baseRow = {
    conversationId: "c1",
    orderNumber: "BW-PAY027",
    buyerName: "Pay Buyer",
    buyerRobloxUsername: "payRBX",
    totalAmount: 250,
    orderCreatedAt: "2026-10-18T09:00:00.000000+00:00",
    orderStatus: "pending",
    assignedAdminId: null,
    assignedAt: null,
    lastMessageId: "p1",
    lastMessageAt: "2026-10-18T10:00:00.000000+00:00",
    lastMessageKind: "payment",
    lastMessagePreview: "Payment details sent",
    lastSenderRole: "admin",
    customerReadAt: null,
    customerReadMessageId: null,
    paymentDetailsSentAt: "2026-10-18T10:00:00.000000+00:00",
    myReadAt: null,
    myReadMessageId: null,
    unreadCount: 2,
    state: "active",
    doneAt: null,
    doneBy: null,
    paymentRequestMessageId: "p1",
    paymentReceivedMessageId: null,
    paymentReceivedAt: null,
    paymentReceivedBy: null,
  };
  const conversationEvent = (extra) => ({
    type: "conversation_event",
    event: {
      conversation_id: "c1",
      order_number: "BW-PAY027",
      assigned_admin_id: null,
      assigned_by: null,
      assigned_at: null,
      customer_read_at: null,
      customer_read_message_id: null,
      admin_read_at: null,
      admin_read_message_id: null,
      state: "active",
      done_at: null,
      done_by: null,
      ...extra,
    },
  });

  test("Paid only when the latest card is the confirmed one", () => {
    assert.equal(isPaymentReceived(baseRow), false);
    assert.equal(isPaymentReceived({ ...baseRow, paymentReceivedMessageId: "p1" }), true);
    assert.equal(isPaymentReceived({ ...baseRow, paymentRequestMessageId: "p2", paymentReceivedMessageId: "p1" }), false);
    assert.equal(isPaymentReceived({ ...baseRow, paymentRequestMessageId: null, paymentReceivedMessageId: null }), false);
    assert.equal(isPaymentReceived(undefined), false);
  });

  test("another admin's confirmation reaches every admin's row live, unread untouched", () => {
    const state = createInboxState({ me: OTHER_ADMIN, rows: [baseRow], view: { filter: "active" } });
    const confirmed = { payment_request_message_id: "p1", payment_received_message_id: "p1", payment_received_at: "2026-10-18T10:05:00Z", payment_received_by: ADMIN };
    const next = inboxReducer(state, conversationEvent(confirmed));
    const row = next.rows["BW-PAY027"];
    assert.equal(isPaymentReceived(row), true);
    assert.equal(row.paymentReceivedBy, ADMIN);
    assert.equal(row.unreadCount, 2);
    // The same event twice (reconnect, two tabs) changes nothing further.
    assert.deepEqual(inboxReducer(next, conversationEvent(confirmed)).rows["BW-PAY027"], row);
  });

  test("events from before 0027 (no payment fields) keep the row's payment state", () => {
    const state = createInboxState({ me: ADMIN, rows: [{ ...baseRow, paymentReceivedMessageId: "p1" }], view: { filter: "active" } });
    const next = inboxReducer(state, conversationEvent({ assigned_admin_id: ADMIN }));
    assert.equal(isPaymentReceived(next.rows["BW-PAY027"]), true);
  });

  test("new payment details after a confirmation read as unpaid at once", () => {
    const state = createInboxState({ me: ADMIN, rows: [{ ...baseRow, paymentReceivedMessageId: "p1" }], view: { filter: "active" } });
    const next = inboxReducer(state, {
      type: "message_event",
      event: {
        conversation_id: "c1",
        order_number: "BW-PAY027",
        is_new_conversation: false,
        message: { id: "p2", sender_role: "admin", sender_user_id: ADMIN, kind: "payment", created_at: "2026-10-18T11:00:00.000000+00:00", client_message_id: null },
        row: {
          last_message_id: "p2",
          last_message_at: "2026-10-18T11:00:00.000000+00:00",
          last_message_kind: "payment",
          last_message_preview: "Payment details sent",
          last_sender_role: "admin",
          payment_details_sent_at: baseRow.paymentDetailsSentAt,
          state: "active",
        },
      },
      activeOrderNumber: null,
    });
    const row = next.rows["BW-PAY027"];
    assert.equal(row.paymentRequestMessageId, "p2");
    assert.equal(isPaymentReceived(row), false);
    assert.equal(row.unreadCount, 2, "an admin's own payment card never adds unread");
  });

  test("a customer message (e.g. a receipt) never marks a payment received", () => {
    const state = createInboxState({ me: ADMIN, rows: [baseRow], view: { filter: "active" } });
    const next = inboxReducer(state, {
      type: "message_event",
      event: {
        conversation_id: "c1",
        order_number: "BW-PAY027",
        is_new_conversation: false,
        message: { id: "r1", sender_role: "customer", sender_user_id: CUSTOMER, kind: "image", created_at: "2026-10-18T10:30:00.000000+00:00", client_message_id: null },
        row: {
          last_message_id: "r1",
          last_message_at: "2026-10-18T10:30:00.000000+00:00",
          last_message_kind: "image",
          last_message_preview: "Photo",
          last_sender_role: "customer",
          payment_details_sent_at: baseRow.paymentDetailsSentAt,
          state: "active",
        },
      },
      activeOrderNumber: null,
    });
    assert.equal(isPaymentReceived(next.rows["BW-PAY027"]), false);
    assert.equal(next.rows["BW-PAY027"].paymentRequestMessageId, "p1");
  });
});
