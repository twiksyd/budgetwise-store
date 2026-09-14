// Server-side half of the protected order-slip credential.
//
// The readable BW order number stays exactly as it was — it is an order
// *name*, not a secret, and it is short enough to guess. Authorisation to
// view a slip is carried instead by a separate 256-bit token that only ever
// lives in the customer's success URL: the database stores just its SHA-256
// digest, so a leak of the snapshot tables does not hand out viewing access.
//
// Standard primitives only (node:crypto SHA-256 + timingSafeEqual). Nothing
// here invents cryptography, and nothing customer-identifying is encoded
// into the token itself — it is opaque random bytes pointing at a row.
//
// Plain .mjs so scripts/test-*.mjs can exercise the real implementation.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// 32 random bytes, base64url-encoded without padding.
export const CHECKOUT_CREDENTIAL_BYTES = 32;
export const CHECKOUT_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isCheckoutCredentialFormatValid(value) {
  return typeof value === "string" && CHECKOUT_CREDENTIAL_PATTERN.test(value);
}

/** Server-side generation, used by tests and any non-browser caller. */
export function createCheckoutCredential() {
  return randomBytes(CHECKOUT_CREDENTIAL_BYTES).toString("base64url");
}

export function hashViewToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

/**
 * Constant-time comparison of a presented token against a stored digest.
 * Returns false for anything malformed rather than throwing, so a hostile
 * URL can never turn into a 500.
 */
export function viewTokenMatchesHash(token, storedHash) {
  if (!isCheckoutCredentialFormatValid(token)) return false;
  if (typeof storedHash !== "string" || !/^[0-9a-f]{64}$/.test(storedHash)) {
    return false;
  }

  const presented = Buffer.from(hashViewToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (presented.length !== stored.length) return false;

  return timingSafeEqual(presented, stored);
}

/**
 * The order-slip gate, in one place.
 *
 * Authorisation needs the snapshot row the reference resolved to AND a
 * token matching that row. A missing token, a token from another order, and
 * a nonexistent order are all the same answer, so nothing is learned by
 * guessing a BW number. Nothing here is single-use: the customer may reopen
 * or refresh the same valid link as often as they like.
 */
export function authorizeOrderSlip({ orderReference, snapshot, viewToken }) {
  if (!snapshot) return false;
  if (snapshot.order_number !== orderReference) return false;

  return viewTokenMatchesHash(viewToken, snapshot.view_token_hash);
}

/**
 * Stable digest of the order request, so a replayed idempotency key that
 * carries different contents is rejected instead of quietly resolving to an
 * unrelated order. Items are sorted so request ordering cannot change it.
 */
export function fingerprintOrderRequest(input) {
  const items = [...input.items]
    .map((item) => [String(item.gamepassId), Number(item.quantity)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const canonical = JSON.stringify({
    items,
    contact: [input.contact.name, input.contact.robloxUsername],
    viaPlus: input.viaPlus
      ? [
          input.viaPlus.robloxDisplayName,
          Boolean(input.viaPlus.age16Confirmed),
          Boolean(input.viaPlus.verifiedAccountConfirmed),
        ]
      : null,
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
