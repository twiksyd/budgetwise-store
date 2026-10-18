// 0029: customer avatars (photo allow-list, identicons), personal game
// filters combined with the existing inbox filters, and their parameters.
// Database rules (auto-assign, concurrency, filter SQL) are in
// supabase/tests/32_* and scripts/test-db.mjs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { describe } from "node:test";

import { identiconSpec, initialsOf, safeGooglePhotoUrl, SHAPES } from "../src/lib/chat/customer-avatar.mjs";
import { createInboxState, inboxReducer, matchesGames, matchesView, visibleRows } from "../src/lib/chat/inbox-state.mjs";
import { gamesParam, parseGameIds } from "../src/lib/chat/inbox-games.mjs";

const KARIN = "11111111-0000-0000-0000-00000000000a";
const DRAG = "11111111-0000-0000-0000-00000000000b";
const ME = "00000000-0000-0000-0000-0000000000a1";

describe("customer avatars: Google photo allow-list", () => {
  test("Google's photo host over https is used as is", () => {
    assert.equal(safeGooglePhotoUrl("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c"), "https://lh3.googleusercontent.com/a/ACg8ocK=s96-c");
    assert.equal(safeGooglePhotoUrl("https://lh5.googleusercontent.com/x"), "https://lh5.googleusercontent.com/x");
  });
  test("anything else is refused (falls back to the identicon)", () => {
    for (const value of [
      "http://lh3.googleusercontent.com/a/x",
      "https://evil.example/lh3.googleusercontent.com/x",
      "https://lh3.googleusercontent.com.evil.example/x",
      "https://user:pw@lh3.googleusercontent.com/x",
      "https://lh3.googleusercontent.com:8443/x",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "//lh3.googleusercontent.com/x",
      `https://lh3.googleusercontent.com/${"a".repeat(3000)}`,
      "",
      null,
      42,
    ]) assert.equal(safeGooglePhotoUrl(value), null, String(value).slice(0, 60));
  });
});

describe("customer avatars: identicons", () => {
  test("deterministic: the same seed is the same design", () => {
    assert.deepEqual(identiconSpec("0123456789abcdef"), identiconSpec("0123456789abcdef"));
  });
  test("varied colours, shapes and patterns across customers", () => {
    const specs = Array.from({ length: 200 }, (_, index) =>
      identiconSpec(createHash("sha256").update(`customer-${index}`).digest("hex").slice(0, 16)),
    );
    assert.ok(new Set(specs.map((spec) => spec.fg)).size >= 8, "many colours");
    assert.equal(new Set(specs.map((spec) => spec.shape)).size, SHAPES.length, "every shape");
    assert.ok(new Set(specs.map((spec) => JSON.stringify(spec.cells))).size >= 150, "mostly distinct patterns");
    for (const spec of specs) {
      assert.ok(spec.cells.length >= 5, "never near-empty");
      for (const [x, y] of spec.cells) assert.ok(x >= 0 && x < 5 && y >= 0 && y < 5);
      // Mirrored left/right.
      const keys = new Set(spec.cells.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of spec.cells) assert.ok(keys.has(`${4 - x},${y}`));
    }
  });
  test("only an opaque 16-hex seed is accepted (no markup can reach the SVG)", () => {
    for (const seed of ['"><script>alert(1)</script>', "00000000-0000-0000-0000-0000000000c1", "custa@gmail.com", "ABCDEF0123456789", "", null]) {
      assert.equal(identiconSpec(seed), null);
    }
    const spec = identiconSpec("fedcba9876543210");
    assert.match(spec.fg, /^#[0-9a-f]{6}$/);
    assert.match(spec.bg, /^#[0-9a-f]{6}$/);
  });
  test("initials are the last fallback", () => {
    assert.equal(initialsOf("Juan Dela Cruz"), "JC");
    assert.equal(initialsOf("maria"), "M");
    assert.equal(initialsOf("  "), "?");
  });
});

describe("game filters", () => {
  const row = (orderNumber, gameIds, extra = {}) => ({
    orderNumber, gameIds, buyerName: orderNumber, buyerRobloxUsername: "", state: "active", unreadCount: 0,
    assignedAdminId: null, lastMessageAt: "2026-10-18T10:00:00.000000+00:00", lastMessageId: orderNumber, ...extra,
  });
  const karin = row("BW-GAMEA1", [KARIN]);
  const drag = row("BW-GAMEB1", [DRAG]);
  const mixed = row("BW-GAMEAB", [KARIN, DRAG]);
  const inquiry = row("GI-1A2B3C4D", []);

  test("All games shows everything", () => {
    for (const r of [karin, drag, mixed, inquiry]) assert.equal(matchesGames(r, { games: null }), true);
  });
  test("orders with ANY chosen game, mixed orders included; inquiries by option", () => {
    const view = { games: [KARIN], includeInquiries: true };
    assert.deepEqual([karin, drag, mixed, inquiry].filter((r) => matchesGames(r, view)).map((r) => r.orderNumber), ["BW-GAMEA1", "BW-GAMEAB", "GI-1A2B3C4D"]);
    assert.equal(matchesGames(inquiry, { games: [KARIN], includeInquiries: false }), false);
    assert.equal(matchesGames(inquiry, { games: [], includeInquiries: true }), true, "General Inquiry only");
    assert.equal(matchesGames(karin, { games: [], includeInquiries: true }), false);
  });
  test("combines with the existing tabs", () => {
    const view = { filter: "unassigned", search: "", games: [DRAG], includeInquiries: false };
    assert.equal(matchesView(drag, view, ME), true);
    assert.equal(matchesView({ ...drag, assignedAdminId: ME }, view, ME), false, "assigned: not Unassigned");
    assert.equal(matchesView(karin, view, ME), false, "other game");
    assert.equal(matchesView({ ...karin, assignedAdminId: ME }, { ...view, filter: "mine" }, ME), false);
    assert.equal(matchesView(karin, { ...view, games: null }, ME), true);
    assert.equal(matchesView(karin, view, ME, "BW-GAMEA1"), true, "the open chat is never yanked");
  });
  test("a live row for another game never enters a filtered list", () => {
    let state = createInboxState({ me: ME, rows: [karin], view: { filter: "active", search: "", games: [KARIN], includeInquiries: true } });
    state = inboxReducer(state, { type: "upsert_row", row: drag, activeOrderNumber: null });
    state = inboxReducer(state, { type: "upsert_row", row: mixed, activeOrderNumber: null });
    assert.deepEqual(visibleRows(state).map((r) => r.orderNumber).sort(), ["BW-GAMEA1", "BW-GAMEAB"]);
  });
  test("rows from before 0029 (no game ids) still show under All games", () => {
    const old = { ...karin };
    delete old.gameIds;
    assert.equal(matchesGames(old, { games: null }), true);
    assert.equal(matchesGames(old, { games: [KARIN] }), false);
  });
});

describe("game filter parameters", () => {
  test("parse and format", () => {
    assert.equal(parseGameIds(null), null);
    assert.equal(parseGameIds("all"), null);
    assert.deepEqual(parseGameIds(""), []);
    assert.deepEqual(parseGameIds(`${KARIN},${DRAG},${KARIN}`), [KARIN, DRAG]);
    assert.equal(parseGameIds("karinderya"), undefined);
    assert.equal(parseGameIds(`${KARIN},'; drop table x;--`), undefined);
    assert.equal(parseGameIds(Array.from({ length: 201 }, (_, i) => `11111111-0000-0000-0000-${String(i).padStart(12, "0")}`).join(",")), undefined);
    assert.equal(gamesParam(null), "all");
    assert.equal(gamesParam([KARIN, DRAG]), `${KARIN},${DRAG}`);
    assert.equal(gamesParam([]), "");
  });
});
