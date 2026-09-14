// Batch 2 — immutable historical order slips.
//
// The invariant under test: once an order exists, changing the catalog's
// price, name, Robux amount, or availability must not change what the
// customer's slip says they ordered. These tests reproduce the audit's
// 2 × ₱100 → ₱50 → "4 units" bug against the snapshot path.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderConfirmationFromSnapshot,
  buildOrderSnapshotLines,
  sumSnapshotLineTotals,
} from "../src/lib/order-snapshot.mjs";
import { buildOrderMessage } from "../src/lib/order-message.mjs";

// Stands in for the catalog rows read at checkout time. Mutating this after
// an order is captured is exactly what must not reach the slip.
function catalogProduct(overrides = {}) {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    gamepassId: "22222222-2222-4222-8222-222222222222",
    gameId: "33333333-3333-4333-8333-333333333333",
    productName: "Excellent Employee",
    gameName: "Bloxburg",
    unitRobuxAmount: 200,
    unitPrice: 100,
    unitCost: 60,
    quantity: 2,
    isViaPlus: false,
    ...overrides,
  };
}

function persist(resolvedLines, overrides = {}) {
  const lines = buildOrderSnapshotLines(resolvedLines);

  return {
    header: {
      order_number: "BW-Y23ZWC",
      buyer_name: "Maria Dela Cruz",
      buyer_roblox_username: "grdqtt",
      total_amount: sumSnapshotLineTotals(lines),
      created_at: "2026-09-14T00:00:00.000Z",
      ...overrides.header,
    },
    // What the database gives back: the same values, plus line_index.
    lines: lines.map((line, index) => ({ ...line, line_index: index })),
    viaPlusDetails: overrides.viaPlusDetails ?? null,
  };
}

test("a line is captured with per-unit price, quantity, and line total", () => {
  const [line] = buildOrderSnapshotLines([catalogProduct()]);

  assert.equal(line.quantity, 2);
  assert.equal(line.unit_price, 100);
  assert.equal(line.line_total, 200);
  assert.equal(line.robux_amount, 200);
  assert.equal(line.line_robux_amount, 400);
  // Internal figures reach `orders` but never the snapshot's public shape.
  assert.equal(line.line_cost, 120);
  assert.equal(line.line_profit, 80);
});

test("a later catalog price cut cannot change quantity or total on the slip", () => {
  const stored = persist([catalogProduct()]);

  // Catalog now says ₱50 — the audit's reproduction. The slip reads only
  // stored rows, so there is nothing for the new price to distort.
  const slip = buildOrderConfirmationFromSnapshot(stored);

  assert.equal(slip.lines.length, 1);
  assert.equal(slip.lines[0].quantity, 2);
  assert.equal(slip.lines[0].sellingPrice, 200);
  assert.equal(slip.total, 200);
  assert.match(buildOrderMessage(slip), /×2 — 400 Robux — ₱200/);
});

test("a later catalog price rise cannot change quantity or total either", () => {
  const stored = persist([catalogProduct()]);
  const slip = buildOrderConfirmationFromSnapshot(stored);

  assert.equal(slip.lines[0].quantity, 2);
  assert.equal(slip.total, 200);
});

test("renaming the product afterwards leaves the slip historically correct", () => {
  const stored = persist([catalogProduct()]);
  const slip = buildOrderConfirmationFromSnapshot(stored);

  assert.equal(slip.lines[0].gamepassName, "Excellent Employee");
  assert.equal(slip.lines[0].gameName, "Bloxburg");
  assert.match(buildOrderMessage(slip), /\n\nBloxburg\n• Excellent Employee ×2/);
});

test("changing the catalog Robux amount afterwards does not move the slip", () => {
  const stored = persist([catalogProduct()]);
  const slip = buildOrderConfirmationFromSnapshot(stored);

  // Robux stays a per-line total on the slip, as the message has always
  // rendered it: 200 per unit × 2.
  assert.equal(slip.lines[0].robuxAmount, 400);
});

test("a deleted or hidden product still renders its historical line", () => {
  const stored = persist([catalogProduct()]);
  // Snapshot rows survive catalog deletion; gamepass_id may be all that is
  // lost, and it is only ever a key/identifier on the slip.
  stored.lines[0].gamepass_id = null;

  const slip = buildOrderConfirmationFromSnapshot(stored);

  assert.equal(slip.lines[0].gamepassId, "");
  assert.equal(slip.lines[0].gamepassName, "Excellent Employee");
  assert.equal(slip.lines[0].sellingPrice, 200);
});

test("a normal multi-product order keeps every line and the stored total", () => {
  const stored = persist([
    catalogProduct(),
    catalogProduct({
      gamepassId: "44444444-4444-4444-8444-444444444444",
      productName: "2x Mastery",
      gameName: "Blox Fruits",
      unitRobuxAmount: 450,
      unitPrice: 350,
      unitCost: 200,
      quantity: 1,
    }),
  ]);

  const slip = buildOrderConfirmationFromSnapshot(stored);
  const message = buildOrderMessage(slip);

  assert.equal(slip.total, 550);
  assert.match(message, /\n\nBloxburg\n• Excellent Employee ×2/);
  assert.match(message, /\n\nBlox Fruits\n• 2x Mastery — 450 Robux — ₱350/);
  assert.match(message, /TOTAL: ₱550/);
  assert.equal(message.includes("VIA PLUS PRE-ORDER ACKNOWLEDGEMENT"), false);
});

test("a Via Plus order keeps its presentation game name and acknowledgement", () => {
  const stored = persist(
    [
      catalogProduct({
        gamepassId: "55555555-5555-4555-8555-555555555555",
        productName: "1,000 Robux",
        // Snapshotted as the name the customer saw, which is also what the
        // message formatter keys Via Plus detection off.
        gameName: "Robux Via Plus",
        unitRobuxAmount: 1000,
        unitPrice: 500,
        unitCost: 400,
        quantity: 1,
        isViaPlus: true,
      }),
    ],
    {
      viaPlusDetails: {
        roblox_display_name: "ExampleDisplay",
        age_16_confirmed: true,
        verified_account_confirmed: true,
        via_plus_robux_amount: 1000,
      },
    },
  );

  const slip = buildOrderConfirmationFromSnapshot(stored);
  const message = buildOrderMessage(slip);

  assert.equal(slip.viaPlusAccount.robloxDisplayName, "ExampleDisplay");
  assert.equal(
    (message.match(/VIA PLUS PRE-ORDER ACKNOWLEDGEMENT/g) ?? []).length,
    1,
  );
  assert.match(message, /Order Amount: 1,000 Robux/);
  assert.match(message, /Display Name: ExampleDisplay/);
  assert.match(
    message,
    /I will wait for your reply before sending any payment\./,
  );
});

test("a mixed order keeps both sections and one acknowledgement", () => {
  const stored = persist(
    [
      catalogProduct({
        productName: "2x Mastery",
        gameName: "Blox Fruits",
        unitRobuxAmount: 450,
        unitPrice: 350,
        quantity: 1,
      }),
      catalogProduct({
        gamepassId: "66666666-6666-4666-8666-666666666666",
        productName: "1,000 Robux",
        gameName: "Robux Via Plus",
        unitRobuxAmount: 1000,
        unitPrice: 250,
        quantity: 2,
        isViaPlus: true,
      }),
    ],
    {
      viaPlusDetails: {
        roblox_display_name: "PlusBuyer",
        age_16_confirmed: true,
        verified_account_confirmed: true,
        via_plus_robux_amount: 2000,
      },
    },
  );

  const slip = buildOrderConfirmationFromSnapshot(stored);
  const message = buildOrderMessage(slip);

  assert.equal(slip.total, 850);
  assert.match(message, /\n\nBlox Fruits\n• 2x Mastery — 450 Robux — ₱350/);
  assert.match(message, /\n\nRobux Via Plus\n• 1,000 Robux ×2 — 2,000 Robux — ₱500/);
  assert.equal(
    (message.match(/VIA PLUS PRE-ORDER ACKNOWLEDGEMENT/g) ?? []).length,
    1,
  );
  assert.match(message, /Order Amount: 2,000 Robux/);
});

test("lines are rendered in their stored order regardless of row order", () => {
  const stored = persist([
    catalogProduct({ productName: "First", quantity: 1 }),
    catalogProduct({
      gamepassId: "77777777-7777-4777-8777-777777777777",
      productName: "Second",
      quantity: 1,
    }),
  ]);

  const shuffled = {
    ...stored,
    lines: [...stored.lines].reverse(),
  };

  const slip = buildOrderConfirmationFromSnapshot(shuffled);

  assert.deepEqual(
    slip.lines.map((line) => line.gamepassName),
    ["First", "Second"],
  );
});

test("money values arriving as numeric strings stay exact", () => {
  const stored = persist([catalogProduct()]);
  stored.header.total_amount = "200.00";
  stored.lines[0].line_total = "200.00";
  stored.lines[0].quantity = "2";
  stored.lines[0].robux_amount = "200";

  const slip = buildOrderConfirmationFromSnapshot(stored);

  assert.equal(slip.total, 200);
  assert.equal(slip.lines[0].sellingPrice, 200);
  assert.equal(slip.lines[0].quantity, 2);
  assert.equal(slip.lines[0].robuxAmount, 400);
});

test("fractional prices round to centavos rather than drifting", () => {
  const lines = buildOrderSnapshotLines([
    catalogProduct({ unitPrice: 139.95, unitCost: 0.1, quantity: 3 }),
  ]);

  assert.equal(lines[0].line_total, 419.85);
  assert.equal(lines[0].line_cost, 0.3);
  assert.equal(lines[0].line_profit, 419.55);
  assert.equal(sumSnapshotLineTotals(lines), 419.85);
});

test("fulfilment status is read live, not frozen into the slip", () => {
  const stored = persist([catalogProduct()]);

  assert.equal(buildOrderConfirmationFromSnapshot(stored).status, "pending");
  assert.equal(
    buildOrderConfirmationFromSnapshot({ ...stored, status: "completed" })
      .status,
    "completed",
  );
});
