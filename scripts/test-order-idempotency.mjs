// Batch 2 — server-side idempotency and retry safety.
//
// A BudgetWise logical order is several `orders` rows sharing one BW number,
// plus its snapshot lines and (sometimes) Via Plus metadata. Retrying a
// checkout must resolve to that SAME logical order — not a second order
// number, not duplicate sibling rows, not a repeated metadata row.
//
// The fake below mirrors create_store_order (migration 0019): the UNIQUE
// index on idempotency_key and the order_number primary key are enforced
// inside a single all-or-nothing call, so what is exercised here is the real
// orchestration in src/lib/order-creation.mjs against the real database
// contract rather than a reimplementation of it.
import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ORDER_NUMBER_ATTEMPTS,
  OrderPersistenceError,
  persistStoreOrder,
} from "../src/lib/order-creation.mjs";

function postgresError(code, message) {
  return { code, message };
}

function createFakeDatabase() {
  const snapshots = new Map(); // order_number -> header row (primary key)
  const orderNumberByKey = new Map(); // unique index on idempotency_key
  const orderRows = []; // public.orders
  const lineRows = []; // store_order_line_snapshots
  const viaPlusRows = []; // store_order_via_plus_details

  return {
    snapshots,
    orderRows,
    lineRows,
    viaPlusRows,

    async findExistingOrder(idempotencyKey) {
      const orderNumber = orderNumberByKey.get(idempotencyKey);
      if (!orderNumber) return null;

      return {
        orderNumber,
        requestFingerprint: snapshots.get(orderNumber).request_fingerprint,
      };
    },

    // One transaction: either every row below lands, or none does.
    async createOrder(attempt) {
      const existingOrderNumber = orderNumberByKey.get(attempt.idempotencyKey);
      if (existingOrderNumber) {
        const existing = snapshots.get(existingOrderNumber);
        if (existing.request_fingerprint !== attempt.requestFingerprint) {
          throw postgresError("BW002", "IDEMPOTENCY_KEY_REUSED");
        }

        return { orderNumber: existingOrderNumber, replayed: true };
      }

      if (snapshots.has(attempt.orderNumber)) {
        throw postgresError("BW001", "ORDER_NUMBER_COLLISION");
      }

      snapshots.set(attempt.orderNumber, {
        order_number: attempt.orderNumber,
        idempotency_key: attempt.idempotencyKey,
        request_fingerprint: attempt.requestFingerprint,
        view_token_hash: attempt.viewTokenHash,
        total_amount: attempt.totalAmount,
      });
      orderNumberByKey.set(attempt.idempotencyKey, attempt.orderNumber);

      attempt.lines.forEach((line, index) => {
        orderRows.push({
          order_number: attempt.orderNumber,
          gamepass_id: line.gamepass_id,
          selling_price: line.line_total,
        });
        lineRows.push({
          order_number: attempt.orderNumber,
          line_index: index,
          gamepass_id: line.gamepass_id,
        });
      });

      if (attempt.viaPlus) {
        viaPlusRows.push({
          order_number: attempt.orderNumber,
          ...attempt.viaPlus,
        });
      }

      return { orderNumber: attempt.orderNumber, replayed: false };
    },
  };
}

function orderRequest(overrides = {}) {
  return {
    idempotencyKey: "key-one",
    requestFingerprint: "fingerprint-one",
    viewTokenHash: "a".repeat(64),
    buyerName: "Maria Dela Cruz",
    buyerRobloxUsername: "grdqtt",
    totalAmount: 550,
    lines: [
      { gamepass_id: "gp-1", line_total: 200, quantity: 2 },
      { gamepass_id: "gp-2", line_total: 350, quantity: 1 },
    ],
    viaPlus: null,
    ...overrides,
  };
}

function sequentialOrderNumbers(...numbers) {
  const queue = [...numbers];
  return () => queue.shift() ?? "BW-EXHAUST";
}

test("submitting the same idempotency key twice returns the same order", async () => {
  const db = createFakeDatabase();
  const request = orderRequest();

  const first = await persistStoreOrder({
    request,
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-AAA111", "BW-BBB222"),
  });
  const second = await persistStoreOrder({
    request,
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-CCC333"),
  });

  assert.equal(first.orderNumber, "BW-AAA111");
  assert.equal(first.replayed, false);
  assert.equal(second.orderNumber, "BW-AAA111");
  assert.equal(second.replayed, true);
  assert.equal(db.snapshots.size, 1);
});

test("a retry never duplicates sibling rows, lines, or metadata", async () => {
  const db = createFakeDatabase();
  const request = orderRequest({
    viaPlus: {
      roblox_display_name: "PlusBuyer",
      age_16_confirmed: true,
      verified_account_confirmed: true,
      via_plus_robux_amount: 2000,
    },
  });
  const submit = () =>
    persistStoreOrder({
      request,
      findExistingOrder: db.findExistingOrder,
      createOrder: db.createOrder,
      generateOrderNumber: sequentialOrderNumbers("BW-AAA111", "BW-BBB222"),
    });

  await submit();
  await submit();
  await submit();

  assert.equal(db.snapshots.size, 1, "one logical order");
  assert.equal(db.orderRows.length, 2, "no duplicate sibling `orders` rows");
  assert.equal(db.lineRows.length, 2, "no duplicate line snapshots");
  assert.equal(db.viaPlusRows.length, 1, "no repeated metadata row");
});

test("a lost response followed by a retry resolves to the created order", async () => {
  const db = createFakeDatabase();
  const request = orderRequest();

  // First request succeeds server-side; its response never reaches the
  // browser, so the pre-flight lookup of the retry is what has to catch it.
  await db.createOrder({ ...request, orderNumber: "BW-AAA111" });

  const retry = await persistStoreOrder({
    request,
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-ZZZ999"),
  });

  assert.equal(retry.orderNumber, "BW-AAA111");
  assert.equal(retry.replayed, true);
  assert.equal(db.snapshots.size, 1);
  assert.equal(db.orderRows.length, 2);
});

test("concurrent requests with one key create exactly one logical order", async () => {
  const db = createFakeDatabase();
  const request = orderRequest();
  // Both raced past the pre-flight lookup before either had committed, so
  // only the database's uniqueness guarantee separates them.
  const raced = () =>
    persistStoreOrder({
      request,
      findExistingOrder: async () => null,
      createOrder: db.createOrder,
      generateOrderNumber: sequentialOrderNumbers("BW-AAA111", "BW-BBB222"),
    });

  const [first, second] = await Promise.all([raced(), raced()]);

  assert.equal(first.orderNumber, second.orderNumber);
  assert.equal(db.snapshots.size, 1);
  assert.equal(db.orderRows.length, 2);
  assert.equal(
    [first.replayed, second.replayed].filter(Boolean).length,
    1,
    "exactly one of the two was a replay",
  );
});

test("a different checkout creates a different order", async () => {
  const db = createFakeDatabase();

  const first = await persistStoreOrder({
    request: orderRequest(),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-AAA111"),
  });
  const second = await persistStoreOrder({
    request: orderRequest({
      idempotencyKey: "key-two",
      requestFingerprint: "fingerprint-two",
    }),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-BBB222"),
  });

  assert.notEqual(first.orderNumber, second.orderNumber);
  assert.equal(db.snapshots.size, 2);
  assert.equal(db.orderRows.length, 4);
});

test("re-ordering the same items later is a new order, not a replay", async () => {
  const db = createFakeDatabase();
  const lines = orderRequest().lines;

  await persistStoreOrder({
    request: orderRequest({ lines }),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-AAA111"),
  });
  // Same cart contents, fresh checkout attempt: a fresh key is generated
  // (the browser drops the finished attempt), so this is a second order.
  const again = await persistStoreOrder({
    request: orderRequest({
      lines,
      idempotencyKey: "key-two",
      requestFingerprint: "fingerprint-one",
    }),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-BBB222"),
  });

  assert.equal(again.orderNumber, "BW-BBB222");
  assert.equal(again.replayed, false);
  assert.equal(db.snapshots.size, 2);
});

test("reusing a key for different contents is rejected, not silently replayed", async () => {
  const db = createFakeDatabase();

  await persistStoreOrder({
    request: orderRequest(),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-AAA111"),
  });

  await assert.rejects(
    persistStoreOrder({
      request: orderRequest({ requestFingerprint: "fingerprint-different" }),
      findExistingOrder: db.findExistingOrder,
      createOrder: db.createOrder,
      generateOrderNumber: sequentialOrderNumbers("BW-BBB222"),
    }),
    (error) =>
      error instanceof OrderPersistenceError &&
      error.reason === "idempotency_conflict",
  );

  assert.equal(db.snapshots.size, 1);
  assert.equal(db.orderRows.length, 2);
});

test("a key reused past the pre-flight lookup is still rejected by the database", async () => {
  const db = createFakeDatabase();

  await persistStoreOrder({
    request: orderRequest(),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-AAA111"),
  });

  await assert.rejects(
    persistStoreOrder({
      request: orderRequest({ requestFingerprint: "fingerprint-different" }),
      findExistingOrder: async () => null,
      createOrder: db.createOrder,
      generateOrderNumber: sequentialOrderNumbers("BW-BBB222"),
    }),
    (error) =>
      error instanceof OrderPersistenceError &&
      error.reason === "idempotency_conflict",
  );

  assert.equal(db.snapshots.size, 1);
});

test("a taken BW number is redrawn instead of merging two customers' orders", async () => {
  const db = createFakeDatabase();

  await persistStoreOrder({
    request: orderRequest(),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    generateOrderNumber: sequentialOrderNumbers("BW-AAA111"),
  });

  const second = await persistStoreOrder({
    request: orderRequest({
      idempotencyKey: "key-two",
      requestFingerprint: "fingerprint-two",
    }),
    findExistingOrder: db.findExistingOrder,
    createOrder: db.createOrder,
    // The generator collides twice before drawing a free number.
    generateOrderNumber: sequentialOrderNumbers(
      "BW-AAA111",
      "BW-AAA111",
      "BW-CCC333",
    ),
  });

  assert.equal(second.orderNumber, "BW-CCC333");
  assert.equal(db.snapshots.size, 2);
  assert.equal(db.orderRows.length, 4, "the first order kept its own rows");
});

test("a transient create-retry signal is retried rather than surfaced", async () => {
  const db = createFakeDatabase();
  let calls = 0;

  const result = await persistStoreOrder({
    request: orderRequest(),
    findExistingOrder: db.findExistingOrder,
    createOrder: async (attempt) => {
      calls += 1;
      if (calls === 1) throw postgresError("BW003", "ORDER_CREATE_RETRY");
      return db.createOrder(attempt);
    },
    generateOrderNumber: sequentialOrderNumbers("BW-AAA111", "BW-BBB222"),
  });

  assert.equal(result.orderNumber, "BW-BBB222");
  assert.equal(db.snapshots.size, 1);
});

test("unrelated database errors are never swallowed", async () => {
  const db = createFakeDatabase();
  const failure = postgresError("23503", "insert violates foreign key");

  await assert.rejects(
    persistStoreOrder({
      request: orderRequest(),
      findExistingOrder: db.findExistingOrder,
      createOrder: async () => {
        throw failure;
      },
      generateOrderNumber: sequentialOrderNumbers("BW-AAA111"),
    }),
    (error) => error === failure,
  );

  assert.equal(db.snapshots.size, 0, "nothing half-created");
});

test("collisions give up after a bounded number of attempts", async () => {
  const db = createFakeDatabase();
  let attempts = 0;

  await assert.rejects(
    persistStoreOrder({
      request: orderRequest(),
      findExistingOrder: db.findExistingOrder,
      createOrder: async () => {
        attempts += 1;
        throw postgresError("BW001", "ORDER_NUMBER_COLLISION");
      },
      generateOrderNumber: () => "BW-AAA111",
    }),
    (error) =>
      error instanceof OrderPersistenceError &&
      error.reason === "order_number_exhausted",
  );

  assert.equal(attempts, MAX_ORDER_NUMBER_ATTEMPTS);
  assert.equal(db.snapshots.size, 0);
});
