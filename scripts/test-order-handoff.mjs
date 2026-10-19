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
