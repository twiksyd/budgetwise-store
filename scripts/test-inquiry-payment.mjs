// 0031: the admin's quoted amount for General Inquiry payment cards. The
// database enforces the same rules (supabase/tests/34_*); this keeps the
// dialog and the API in agreement with it.
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { MAX_QUOTE_AMOUNT, parseQuoteAmount } from "../src/lib/chat/payment-quote.mjs";
import { toChatMessage } from "../src/lib/chat/dto.mjs";

describe("inquiry quote amount", () => {
  test("accepts explicit peso amounts with up to two decimals", () => {
    assert.equal(parseQuoteAmount("499.50"), 499.5);
    assert.equal(parseQuoteAmount("1,250"), 1250);
    assert.equal(parseQuoteAmount(" 75 "), 75);
    assert.equal(parseQuoteAmount("0.01"), 0.01);
    assert.equal(parseQuoteAmount(MAX_QUOTE_AMOUNT), 1_000_000);
    assert.equal(parseQuoteAmount(120), 120);
  });
  test("refuses anything else instead of guessing", () => {
    for (const value of ["", "0", "0.00", "-5", "10.005", "1000000.01", "₱100", "1e3", "abc", "12.3.4", null, undefined, {}, Number.NaN, Infinity]) {
      assert.equal(parseQuoteAmount(value), null, String(value));
    }
  });
});

describe("inquiry payment card for the customer", () => {
  test("renders like an order card; internal fields stay on the server", () => {
    const dto = toChatMessage(
      {
        id: "p1", order_number: "GI-1A2B3C4D", sender_role: "admin", sender_user_id: "admin-1", kind: "payment",
        body: "GCash payment details.", created_at: "2026-10-19T10:00:00.000000+00:00",
        payload: { provider: "gcash", label: "GCash", account_name: "B W Store", account_number: "09170000031",
          amount: 499.5, currency: "PHP", has_qr: true, qr_path: "qr/secret.png", method_id: "m1", amount_source: "admin_quote" },
      },
      { viewer: "customer", viewerUserId: "cust-1" },
    );
    assert.deepEqual(dto.payment, { provider: "gcash", label: "GCash", accountName: "B W Store", accountNumber: "09170000031", amount: 499.5, currency: "PHP", hasQr: true });
    const wire = JSON.stringify(dto);
    for (const secret of ["qr/secret.png", "m1", "admin_quote", "admin-1"]) assert.equal(wire.includes(secret), false, secret);
  });
});
