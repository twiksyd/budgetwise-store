// Batch 2 — protected order-slip access.
//
// The readable BW number names an order; it does not authorise viewing one.
// These tests drive the real gate (authorizeOrderSlip) that
// getOrderConfirmation calls before it will return any customer data.
import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeOrderSlip,
  createCheckoutCredential,
  fingerprintOrderRequest,
  hashViewToken,
  isCheckoutCredentialFormatValid,
  viewTokenMatchesHash,
} from "../src/lib/order-access.mjs";

function storedOrder(orderNumber, token) {
  return { order_number: orderNumber, view_token_hash: hashViewToken(token) };
}

test("a viewing credential is 256 bits of base64url randomness", () => {
  const token = createCheckoutCredential();

  assert.equal(token.length, 43);
  assert.equal(isCheckoutCredentialFormatValid(token), true);
  assert.notEqual(token, createCheckoutCredential());
});

test("only the hash is ever stored, never the token", () => {
  const token = createCheckoutCredential();
  const hash = hashViewToken(token);

  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(token), false);
  // Nothing customer-identifying is encoded in the token itself.
  assert.equal(hashViewToken(token), hash);
});

test("a valid order reference with its valid token opens the slip", () => {
  const token = createCheckoutCredential();

  assert.equal(
    authorizeOrderSlip({
      orderReference: "BW-Y23ZWC",
      snapshot: storedOrder("BW-Y23ZWC", token),
      viewToken: token,
    }),
    true,
  );
});

test("a valid order reference without a token is refused", () => {
  const snapshot = storedOrder("BW-Y23ZWC", createCheckoutCredential());

  for (const viewToken of [undefined, null, ""]) {
    assert.equal(
      authorizeOrderSlip({
        orderReference: "BW-Y23ZWC",
        snapshot,
        viewToken,
      }),
      false,
    );
  }
});

test("a valid order reference with a wrong token is refused", () => {
  const snapshot = storedOrder("BW-Y23ZWC", createCheckoutCredential());

  assert.equal(
    authorizeOrderSlip({
      orderReference: "BW-Y23ZWC",
      snapshot,
      viewToken: createCheckoutCredential(),
    }),
    false,
  );
  // Including near-misses and malformed junk from a hand-edited URL.
  assert.equal(
    authorizeOrderSlip({
      orderReference: "BW-Y23ZWC",
      snapshot,
      viewToken: "../../etc/passwd",
    }),
    false,
  );
});

test("another order's token does not open this order", () => {
  const ownToken = createCheckoutCredential();
  const otherToken = createCheckoutCredential();

  assert.equal(
    authorizeOrderSlip({
      orderReference: "BW-Y23ZWC",
      snapshot: storedOrder("BW-Y23ZWC", ownToken),
      viewToken: otherToken,
    }),
    false,
  );
  // And the pairing is checked both ways round.
  assert.equal(
    authorizeOrderSlip({
      orderReference: "BW-AAA111",
      snapshot: storedOrder("BW-AAA111", otherToken),
      viewToken: ownToken,
    }),
    false,
  );
});

test("a token cannot be replayed against a different order's row", () => {
  const token = createCheckoutCredential();

  assert.equal(
    authorizeOrderSlip({
      orderReference: "BW-AAA111",
      snapshot: storedOrder("BW-Y23ZWC", token),
      viewToken: token,
    }),
    false,
  );
});

test("an unknown order reference is refused even with a well-formed token", () => {
  assert.equal(
    authorizeOrderSlip({
      orderReference: "BW-NOPE12",
      snapshot: null,
      viewToken: createCheckoutCredential(),
    }),
    false,
  );
});

test("a valid link stays usable across refreshes and reopens", () => {
  const token = createCheckoutCredential();
  const snapshot = storedOrder("BW-Y23ZWC", token);
  const open = () =>
    authorizeOrderSlip({
      orderReference: "BW-Y23ZWC",
      snapshot,
      viewToken: token,
    });

  // Initial navigation, refresh, Back/Forward, reopening the saved link.
  assert.deepEqual([open(), open(), open(), open()], [true, true, true, true]);
});

test("a corrupted stored hash fails closed instead of throwing", () => {
  const token = createCheckoutCredential();

  assert.equal(viewTokenMatchesHash(token, null), false);
  assert.equal(viewTokenMatchesHash(token, "not-a-hash"), false);
  assert.equal(viewTokenMatchesHash(token, hashViewToken(token).slice(0, 10)), false);
});

test("the request fingerprint is stable and content-sensitive", () => {
  const request = {
    items: [
      { gamepassId: "b", quantity: 1 },
      { gamepassId: "a", quantity: 2 },
    ],
    contact: { name: "Maria Dela Cruz", robloxUsername: "grdqtt" },
  };
  const reordered = {
    ...request,
    items: [...request.items].reverse(),
  };

  // Same order, listed differently, is still the same order.
  assert.equal(
    fingerprintOrderRequest(request),
    fingerprintOrderRequest(reordered),
  );

  // A different cart, buyer, or Via Plus detail is a different request.
  assert.notEqual(
    fingerprintOrderRequest(request),
    fingerprintOrderRequest({
      ...request,
      items: [{ gamepassId: "a", quantity: 3 }],
    }),
  );
  assert.notEqual(
    fingerprintOrderRequest(request),
    fingerprintOrderRequest({
      ...request,
      contact: { name: "Someone Else", robloxUsername: "grdqtt" },
    }),
  );
  assert.notEqual(
    fingerprintOrderRequest(request),
    fingerprintOrderRequest({
      ...request,
      viaPlus: {
        robloxDisplayName: "PlusBuyer",
        age16Confirmed: true,
        verifiedAccountConfirmed: true,
      },
    }),
  );
});
