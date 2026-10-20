// Where an order continues after checkout: Messenger by default, the
// on-site conversation only for configured sources (e.g. TikTok).
//   node --test scripts/test-order-handoff.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseOrderChannel,
  detectTrafficSource,
  orderMessengerLink,
  parseTrafficSource,
} from "../src/lib/order-handoff.mjs";

const OFF = { channel: "messenger", siteChatSources: [] };
const TIKTOK_ON_SITE = { channel: "messenger", siteChatSources: ["tiktok"] };

describe("channel choice (server side)", () => {
  test("default: everyone continues on Messenger", () => {
    assert.equal(chooseOrderChannel(undefined, OFF), "messenger");
    assert.equal(chooseOrderChannel("tiktok", OFF), "messenger");
  });
  test("TikTok customers keep the on-site chat once it is switched on", () => {
    assert.equal(chooseOrderChannel("tiktok", TIKTOK_ON_SITE), "site");
    assert.equal(chooseOrderChannel(undefined, TIKTOK_ON_SITE), "messenger");
  });
  test("unknown sources can't steer it", () => {
    assert.equal(chooseOrderChannel("facebook", TIKTOK_ON_SITE), "messenger");
    assert.equal(parseTrafficSource("site"), null);
  });
  test("the whole store can go back to the on-site chat", () => {
    assert.equal(chooseOrderChannel(undefined, { channel: "site", siteChatSources: [] }), "site");
  });
});

describe("detecting TikTok visits", () => {
  test("tagged links, click ids, referrer and the in-app browser", () => {
    assert.equal(detectTrafficSource({ search: "?utm_source=TikTok" }), "tiktok");
    assert.equal(detectTrafficSource({ search: "?ttclid=abc" }), "tiktok");
    assert.equal(detectTrafficSource({ referrer: "https://www.tiktok.com/@budgetwise" }), "tiktok");
    assert.equal(detectTrafficSource({ userAgent: "Mozilla/5.0 ... BytedanceWebview/d8a21c6" }), "tiktok");
  });
  test("everything else is no source", () => {
    assert.equal(detectTrafficSource({ search: "?utm_source=facebook", referrer: "https://faketiktok.com.evil.test/" }), null);
    assert.equal(detectTrafficSource({ referrer: "not a url" }), null);
    assert.equal(detectTrafficSource(), null);
  });
});

describe("Messenger link", () => {
  test("opens BudgetWise DGM with the order number prefilled", () => {
    const link = orderMessengerLink("1472889109233950", "BW-K7Q2ZP");
    assert.ok(link.startsWith("https://m.me/1472889109233950?text="));
    assert.ok(decodeURIComponent(link).includes("BW-K7Q2ZP"));
  });
  test("refuses a malformed page id", () => {
    assert.equal(orderMessengerLink("x/../evil?y=1", "BW-1"), null);
    assert.equal(orderMessengerLink(null, "BW-1"), null);
  });
});

describe("full Messenger follow-up slip", () => {
  const details = {
    kind: "order",
    order: { orderNumber: "BW-PAPGA3", total: 250 },
    customer: { name: "Sample Customer", robloxUsername: "SampleRoblox", email: "private@example.test" },
    viaPlus: null,
    groups: [{ gameName: "Pa Deliber", lines: [{
      gameName: "Pa Deliber", productName: "VIP Pass", quantity: 2,
      robuxAmount: 349, totalRobux: 698, unitPrice: 125, lineTotal: 250,
      your_cost: 101.21,
    }] }],
  };
  test("uses frozen line totals, customer identity and quantities in the prefill", async () => {
    const { buildMessengerOrderSlip } = await import("../src/lib/order-handoff.mjs");
    const message = buildMessengerOrderSlip(details);
    assert.match(message, /BUDGETWISE ORDER SLIP/);
    assert.match(message, /Name: Sample Customer/);
    assert.match(message, /Roblox Username: SampleRoblox/);
    assert.match(message, /VIP Pass ×2 — 698 Robux — ₱250/);
    assert.match(message, /TOTAL: ₱250/);
    assert.ok(!message.includes("private@example.test"));
    assert.ok(!message.includes("101.21"));
    const link = new URL(orderMessengerLink("1472889109233950", details.order.orderNumber, message));
    assert.equal(link.searchParams.get("text"), message);
    assert.ok(!message.includes("following up on my order"));
  });
  test("does not produce an incomplete slip for missing lines or inquiry threads", async () => {
    const { buildMessengerOrderSlip } = await import("../src/lib/order-handoff.mjs");
    assert.equal(buildMessengerOrderSlip({ ...details, groups: [] }), null);
    assert.equal(buildMessengerOrderSlip({ ...details, kind: "inquiry" }), null);
  });
  test("retains Via Plus display name and acknowledgement", async () => {
    const { buildMessengerOrderSlip } = await import("../src/lib/order-handoff.mjs");
    const message = buildMessengerOrderSlip({
      ...details,
      viaPlus: { robloxDisplayName: "Sample Display", robuxAmount: 698 },
      groups: [{ lines: [{ ...details.groups[0].lines[0], gameName: "Robux Via Plus" }] }],
    });
    assert.match(message, /Display Name: Sample Display/);
    assert.match(message, /VIA PLUS PRE-ORDER ACKNOWLEDGEMENT/);
  });
});
