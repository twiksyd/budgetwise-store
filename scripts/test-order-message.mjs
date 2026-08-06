import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderMessage,
  normalizePlainTextMessage,
  normalizeOrderMessageForMessenger,
} from "../src/lib/order-message.mjs";

function order(overrides = {}) {
  return {
    orderNumber: "BW-Y23ZWC",
    buyerName: "Maria Dela Cruz",
    buyerRobloxUsername: "grdqtt",
    status: "pending",
    createdAt: "2026-08-07T00:00:00.000Z",
    total: 180,
    lines: [
      {
        gamepassId: "1",
        gameName: "Drag Drive Simulator",
        gamepassName: "Rp 500,000,000",
        robuxAmount: 399,
        sellingPrice: 140,
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

function assertPlainTextOnly(message) {
  assert.equal(message, normalizePlainTextMessage(message));
  assert.equal(message.includes("\t"), false);
  assert.equal(/<\/?[a-z][\s\S]*>/i.test(message), false);
  assert.equal(/\*\*/.test(message), false);
}

function buildMessengerHref(message) {
  const messengerUrl = new URL("https://m.me/61589047545427");
  messengerUrl.searchParams.set("text", normalizeOrderMessageForMessenger(message));
  return messengerUrl.toString();
}

test("one item message uses separate contact and item lines", () => {
  const message = buildOrderMessage(order());

  assert.match(
    message,
    /Facebook Name: Maria Dela Cruz\nRoblox Username: grdqtt\nOrder Number: BW-Y23ZWC\n\nORDER ITEMS\n\nDrag Drive Simulator\n• Rp 500,000,000 — 399 Robux — ₱140/,
  );
  assert.equal(message.includes("grdqttDrag Drive Simulator"), false);
  assertPlainTextOnly(message);
});

test("five items remain grouped under one game", () => {
  const message = buildOrderMessage(
    order({
      total: 250,
      lines: Array.from({ length: 5 }, (_, index) => ({
        gamepassId: String(index + 1),
        gameName: "Anime Expedition",
        gamepassName: `Pass ${index + 1}`,
        robuxAmount: 25 * (index + 1),
        sellingPrice: 10 * (index + 1),
        quantity: 1,
      })),
    }),
  );

  assert.equal((message.match(/^Anime Expedition$/gm) ?? []).length, 1);
  assert.equal((message.match(/^• /gm) ?? []).length, 5);
  assert.match(message, /TOTAL: ₱250/);
  assertPlainTextOnly(message);
});

test("multiple games are separated by blank lines", () => {
  const message = buildOrderMessage(
    order({
      total: 155,
      lines: [
        {
          gamepassId: "1",
          gameName: "Game One",
          gamepassName: "Starter Pack",
          robuxAmount: 50,
          sellingPrice: 25,
          quantity: 1,
        },
        {
          gamepassId: "2",
          gameName: "Game Two",
          gamepassName: "VIP",
          robuxAmount: 200,
          sellingPrice: 130,
          quantity: 1,
        },
      ],
    }),
  );

  assert.match(message, /\n\nGame One\n• Starter Pack/);
  assert.match(message, /\n\nGame Two\n• VIP/);
  assertPlainTextOnly(message);
});

test("quantity greater than one is preserved after the item name", () => {
  const message = buildOrderMessage(
    order({
      total: 300,
      lines: [
        {
          gamepassId: "1",
          gameName: "Bloxburg",
          gamepassName: "Excellent Employee",
          robuxAmount: 600,
          sellingPrice: 300,
          quantity: 3,
        },
      ],
    }),
  );

  assert.match(message, /• Excellent Employee ×3 — 600 Robux — ₱300/);
  assertPlainTextOnly(message);
});

test("long Facebook name and long Roblox username stay on separate lines", () => {
  const message = buildOrderMessage(
    order({
      buyerName: "María-Louise O'Connor-Santos ✨ BudgetWise Customer",
      buyerRobloxUsername: "This Username Has Spaces And Symbols__123",
    }),
  );

  assert.match(
    message,
    /Facebook Name: María-Louise O'Connor-Santos ✨ BudgetWise Customer\nRoblox Username: This Username Has Spaces And Symbols__123\nOrder Number:/,
  );
  assert.equal(
    message.includes("This Username Has Spaces And Symbols__123Drag"),
    false,
  );
  assertPlainTextOnly(message);
});

test("Robux Via Link Covered and No Tax sections remain distinct", () => {
  const message = buildOrderMessage(
    order({
      total: 420,
      lines: [
        {
          gamepassId: "covered",
          gameName: "Robux Sell - Covered Tax",
          gamepassName: "1,000 Robux",
          robuxAmount: 1000,
          sellingPrice: 300,
          quantity: 1,
        },
        {
          gamepassId: "no-tax",
          gameName: "Robux Sell - No Tax",
          gamepassName: "600 Robux",
          robuxAmount: 600,
          sellingPrice: 120,
          quantity: 1,
        },
      ],
    }),
  );

  assert.match(message, /\n\nRobux Sell - Covered Tax\n• 1,000 Robux/);
  assert.match(message, /\n\nRobux Sell - No Tax\n• 600 Robux/);
  assertPlainTextOnly(message);
});

test("long product names remain plain text", () => {
  const message = buildOrderMessage(
    order({
      lines: [
        {
          gamepassId: "long",
          gameName: "Premium Game",
          gamepassName:
            "Ultra Premium Legendary Access Bundle With Extra Long Product Name",
          robuxAmount: 9999,
          sellingPrice: 888,
          quantity: 1,
        },
      ],
      total: 888,
    }),
  );

  assert.match(
    message,
    /Ultra Premium Legendary Access Bundle With Extra Long Product Name/,
  );
  assertPlainTextOnly(message);
});

test("clipboard text normalization keeps plain LF line endings", () => {
  assert.equal(normalizePlainTextMessage("a\r\nb\rc"), "a\nb\nc");
});

test("decoded Messenger text keeps username, order number, and items separated", () => {
  const message = buildOrderMessage(
    order({
      orderNumber: "BW-XXXXXX",
      buyerName: "José Toyotab ✨",
      buyerRobloxUsername: "toyotab",
      total: 444,
      lines: [
        {
          gamepassId: "drag",
          gameName: "Drag Drive Simulator",
          gamepassName: "Product",
          robuxAmount: 123,
          sellingPrice: 111,
          quantity: 2,
        },
        {
          gamepassId: "covered",
          gameName: "Robux Sell - Covered Tax",
          gamepassName: "1,000 Robux",
          robuxAmount: 1000,
          sellingPrice: 222,
          quantity: 1,
        },
        {
          gamepassId: "no-tax",
          gameName: "Robux Sell - No Tax",
          gamepassName: "600 Robux",
          robuxAmount: 600,
          sellingPrice: 111,
          quantity: 1,
        },
      ],
    }),
  );

  const href = buildMessengerHref(message);
  const decoded = new URL(href).searchParams.get("text");

  assert.equal(decoded, normalizeOrderMessageForMessenger(message));
  assert.equal(decoded.includes("toyotabDrag Drive Simulator"), false);
  assert.match(
    decoded,
    /Facebook Name: José Toyotab ✨\nRoblox Username: toyotab\nOrder Number: BW-XXXXXX\n\nORDER ITEMS\n\nDrag Drive Simulator\n• Product ×2 — 123 Robux — ₱111/,
  );
  assert.match(decoded, /\n\nRobux Sell - Covered Tax\n• 1,000 Robux/);
  assert.match(decoded, /\n\nRobux Sell - No Tax\n• 600 Robux/);
  assert.match(decoded, /TOTAL: ₱444/);
  assert.equal(decoded.includes("%E2%82%B1"), false);
  assertPlainTextOnly(decoded);
});

test("Messenger text normalization removes tabs without changing line breaks", () => {
  const normalized = normalizeOrderMessageForMessenger("a\tb\r\n\nc\rd");
  assert.equal(normalized, "ab\n\nc\nd");
});
