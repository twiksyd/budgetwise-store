// Retry-safe creation of one logical BudgetWise order.
//
// A logical order is several `orders` rows sharing one BW number, plus its
// snapshot rows and (sometimes) Via Plus metadata, so "don't create it
// twice" has to mean the whole set — not just the first row. The guarantee
// lives in the database: a UNIQUE index on store_order_snapshots
// (idempotency_key), reached through the create_store_order RPC, which
// wraps every insert in one transaction. Nothing here depends on
// select-then-insert being race-free; the pre-flight lookup below is purely
// an optimisation.
//
// The database work is injected rather than imported so this orchestration
// — replay, fingerprint conflict, BW-code collision retry — is testable
// without a live Supabase.

// Custom SQLSTATEs raised by create_store_order (see migration 0019).
export const ORDER_NUMBER_COLLISION_CODE = "BW001";
export const IDEMPOTENCY_KEY_REUSED_CODE = "BW002";
export const ORDER_CREATE_RETRY_CODE = "BW003";

// Six characters from a 32-symbol alphabet: a collision is rare, and each
// retry redraws, so a handful of attempts is plenty.
export const MAX_ORDER_NUMBER_ATTEMPTS = 5;

export class OrderPersistenceError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = "OrderPersistenceError";
    this.reason = reason;
  }
}

function errorCode(error) {
  return error && typeof error === "object" ? error.code : undefined;
}

function errorMessage(error) {
  return error && typeof error === "object" && typeof error.message === "string"
    ? error.message
    : "";
}

export function isOrderNumberCollision(error) {
  return (
    errorCode(error) === ORDER_NUMBER_COLLISION_CODE ||
    errorMessage(error).includes("ORDER_NUMBER_COLLISION")
  );
}

export function isIdempotencyKeyReused(error) {
  return (
    errorCode(error) === IDEMPOTENCY_KEY_REUSED_CODE ||
    errorMessage(error).includes("IDEMPOTENCY_KEY_REUSED")
  );
}

export function isOrderCreateRetry(error) {
  return (
    errorCode(error) === ORDER_CREATE_RETRY_CODE ||
    errorMessage(error).includes("ORDER_CREATE_RETRY")
  );
}

/**
 * Turns an already-found snapshot row into a replay result, rejecting a key
 * that is being reused for different order contents.
 */
export function resolveReplayedOrder(existing, requestFingerprint) {
  if (!existing) return null;

  if (existing.requestFingerprint !== requestFingerprint) {
    throw new OrderPersistenceError(
      "This checkout was already submitted with different details. Please refresh and try again.",
      "idempotency_conflict",
    );
  }

  return { orderNumber: existing.orderNumber, replayed: true };
}

/**
 * @param request           canonical order request (already validated)
 * @param findExistingOrder (idempotencyKey) => { orderNumber, requestFingerprint } | null
 * @param createOrder       ({ orderNumber, ...request }) => { orderNumber, replayed }
 * @param generateOrderNumber  fresh readable BW number per attempt
 */
export async function persistStoreOrder({
  request,
  findExistingOrder = async () => null,
  createOrder,
  generateOrderNumber,
  maxAttempts = MAX_ORDER_NUMBER_ATTEMPTS,
}) {
  // Fast path for the case this exists for: the customer's first request
  // succeeded but its response never arrived. Answering from the existing
  // row means a retry isn't re-judged against store hours or availability
  // that may have moved since the order was already accepted.
  const replayed = resolveReplayedOrder(
    await findExistingOrder(request.idempotencyKey),
    request.requestFingerprint,
  );
  if (replayed) return replayed;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const orderNumber = generateOrderNumber();

    try {
      const result = await createOrder({ ...request, orderNumber });
      return {
        orderNumber: result.orderNumber,
        replayed: Boolean(result.replayed),
      };
    } catch (error) {
      if (isIdempotencyKeyReused(error)) {
        throw new OrderPersistenceError(
          "This checkout was already submitted with different details. Please refresh and try again.",
          "idempotency_conflict",
        );
      }

      if (isOrderNumberCollision(error) || isOrderCreateRetry(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new OrderPersistenceError(
    "Could not allocate an order number. Please try again.",
    "order_number_exhausted",
  );
}
