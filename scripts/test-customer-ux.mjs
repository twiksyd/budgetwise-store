// Mobile customer experience, Done workflow and image albums: pure rules.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  badgeText,
  customerStateLabel,
  describeOrderItems,
  orderOpenSection,
  pickConversation,
  relevantConversations,
  summarizeLines,
} from "../src/lib/chat/order-summary.mjs";
import {
  ALBUM_MAX_IMAGES,
  albumCaption,
  albumLayout,
  buildAlbumAttachments,
  parseAlbumRequest,
  parseUploadFields,
  UPLOAD_CONCURRENCY,
} from "../src/lib/chat/album.mjs";
import { runUploadQueue, uploadProgressText } from "../src/lib/chat/upload-queue.mjs";
import { handleAlbumMedia } from "../src/lib/chat/route-core.mjs";
import { createInboxState, inboxReducer, visibleRows } from "../src/lib/chat/inbox-state.mjs";
import { toChatMessage } from "../src/lib/chat/dto.mjs";
import { buildOrderDetails } from "../src/lib/chat/order-details.mjs";

const at = (minutes) => new Date(Date.UTC(2026, 9, 17, 10, minutes)).toISOString();
const CID = "11111111-2222-4333-8444-555555555555";

describe("which conversation the floating button opens", () => {
  const rows = [
    { orderNumber: "BW-OLD", state: "done", unreadCount: 0, lastMessageAt: at(1) },
    { orderNumber: "BW-ACTIVE", state: "active", unreadCount: 0, lastMessageAt: at(30) },
    { orderNumber: "BW-REPLY", state: "active", unreadCount: 2, lastMessageAt: at(20) },
    { orderNumber: "BW-REPLY2", state: "done", unreadCount: 1, lastMessageAt: at(10) },
  ];

  test("1. the newest conversation with an unread BudgetWise reply wins", () => {
    assert.equal(pickConversation(rows).orderNumber, "BW-REPLY");
  });
  test("2. otherwise the most recently active unresolved one", () => {
    assert.equal(pickConversation(rows.map((row) => ({ ...row, unreadCount: 0 }))).orderNumber, "BW-ACTIVE");
  });
  test("3. otherwise the most recent order", () => {
    const allDone = [
      { orderNumber: "BW-A", state: "done", unreadCount: 0, lastMessageAt: at(1), createdAt: at(1) },
      { orderNumber: "BW-B", state: "done", unreadCount: 0, lastMessageAt: at(2), createdAt: at(5) },
    ];
    assert.equal(pickConversation(allDone).orderNumber, "BW-B");
    assert.equal(pickConversation([]), null);
  });
  test("the switcher lists unread first, then active; never old completed chats", () => {
    assert.deepEqual(relevantConversations(rows).map((row) => row.orderNumber), ["BW-REPLY", "BW-REPLY2", "BW-ACTIVE"]);
  });
});

describe("badges and labels", () => {
  test("badge reads 1..9 then 9+, nothing at zero", () => {
    assert.deepEqual([0, 1, 2, 3, 9, 10, 57].map(badgeText), [null, "1", "2", "3", "9", "9+", "9+"]);
  });
  test("customers see In progress / Completed, never the admin word Done", () => {
    assert.equal(customerStateLabel("done"), "Completed");
    assert.equal(customerStateLabel("active"), "In progress");
    assert.equal(customerStateLabel(undefined), "In progress");
  });
});

describe("order summaries (from frozen order lines only)", () => {
  const lines = [
    { line_index: 1, gamepass_id: "gp-2", product_name: "Mastery", game_name: "Blox Fruits", quantity: 1, robux_amount: 450, unit_price: 125, line_total: 125 },
    { line_index: 0, gamepass_id: "gp-1", product_name: "Money", game_name: "Blox Fruits", quantity: 5, robux_amount: 450, unit_price: 125, line_total: 625 },
    { line_index: 2, gamepass_id: null, product_name: "VIP", game_name: "Grow a Garden", quantity: 1, robux_amount: 200, unit_price: 99, line_total: 99 },
  ];
  const artwork = new Map([["gp-1", "https://img.example/money.png"]]);

  test("quantity 5 of one product is ONE line with Qty 5, in order, with the catalog image", () => {
    const summary = summarizeLines(lines, artwork);
    assert.equal(summary.length, 3);
    assert.deepEqual(summary.map((line) => line.lineIndex), [0, 1, 2]);
    assert.equal(summary[0].quantity, 5);
    assert.equal(summary[0].imageUrl, "https://img.example/money.png");
    assert.equal(summary[1].imageUrl, null, "no artwork -> no invented image");
  });
  test("card text: game and item count", () => {
    assert.equal(describeOrderItems(summarizeLines(lines.slice(0, 2))), "Blox Fruits · 6 items");
    assert.equal(describeOrderItems(summarizeLines(lines)), "Blox Fruits + 1 more game · 7 items");
    assert.equal(describeOrderItems([]), "0 items");
  });
  test("My Orders: unread first (newest reply first), then the rest by activity", () => {
    const rows = [
      { orderNumber: "A", unreadCount: 0, lastMessageAt: at(50), createdAt: at(1) },
      { orderNumber: "B", unreadCount: 1, lastMessageAt: at(10), createdAt: at(2) },
      { orderNumber: "C", unreadCount: 3, lastMessageAt: at(40), createdAt: at(3) },
      { orderNumber: "D", unreadCount: 0, lastMessageAt: null, createdAt: at(55) },
    ];
    const { unread, active } = orderOpenSection(rows);
    assert.deepEqual(unread.map((row) => row.orderNumber), ["C", "B"]);
    assert.deepEqual(active.map((row) => row.orderNumber), ["D", "A"]);
  });
  test("admin details carry the same catalog images", () => {
    const details = buildOrderDetails({
      snapshot: { order_number: "BW-X", buyer_name: "Juan", buyer_roblox_username: "juan", total_amount: 849, created_at: at(0) },
      lines: lines.map((line) => ({ ...line, game_id: null, is_via_plus: false })),
      viaPlus: null, fulfillmentRows: [], status: "pending",
      conversation: { id: "c", assigned_admin_id: null, payment_details_sent_at: null, state: "done", done_at: at(5) },
      customerEmail: null, artwork,
    });
    assert.equal(details.groups[0].lines[0].imageUrl, "https://img.example/money.png");
    assert.equal(details.order.state, "done");
  });
});

describe("album requests", () => {
  const items = (n) => Array.from({ length: n }, (_, position) => ({ position, width: 1080, height: 1920 }));

  test("a valid 8-image proof album from an admin", () => {
    const parsed = parseAlbumRequest({ clientMessageId: CID, body: " Done po ", label: "proof_of_delivery", items: items(8) }, { role: "admin" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.items.length, 8);
    assert.equal(parsed.body, "Done po");
    assert.equal(parsed.label, "proof_of_delivery");
  });
  test("customers can send albums (receipts) but never label them", () => {
    assert.equal(parseAlbumRequest({ clientMessageId: CID, items: items(2) }, { role: "customer" }).ok, true);
    const labelled = parseAlbumRequest({ clientMessageId: CID, label: "proof_of_delivery", items: items(1) }, { role: "customer" });
    assert.deepEqual([labelled.ok, labelled.status], [false, 403]);
  });
  test("1 to 10 images, positions in order, real ids only", () => {
    assert.equal(parseAlbumRequest({ clientMessageId: CID, items: [] }, { role: "admin" }).ok, false);
    assert.equal(parseAlbumRequest({ clientMessageId: CID, items: items(ALBUM_MAX_IMAGES + 1) }, { role: "admin" }).ok, false);
    assert.equal(parseAlbumRequest({ clientMessageId: CID, items: [{ position: 1 }, { position: 0 }] }, { role: "admin" }).ok, false);
    assert.equal(parseAlbumRequest({ clientMessageId: "not-a-uuid", items: items(1) }, { role: "admin" }).ok, false);
    assert.equal(parseAlbumRequest({ clientMessageId: CID, label: "anything", items: items(1) }, { role: "admin" }).ok, false);
  });
  test("bogus dimensions are dropped, not trusted", () => {
    const parsed = parseAlbumRequest({ clientMessageId: CID, items: [{ position: 0, width: -5, height: "1e9" }] }, { role: "admin" });
    assert.deepEqual(parsed.items[0], { position: 0, width: null, height: null });
  });
  test("upload fields: position 0-9 and a uuid", () => {
    assert.equal(parseUploadFields({ position: "3", clientMessageId: CID }).ok, true);
    for (const position of ["10", "-1", "1.5", "01", "x", null]) {
      assert.equal(parseUploadFields({ position, clientMessageId: CID }).ok, false, String(position));
    }
    assert.equal(parseUploadFields({ position: "0", clientMessageId: "../etc" }).ok, false);
  });
  test("paths come only from the server's own listing; a missing image is named", () => {
    const uploads = new Map([
      [0, { position: 0, path: "BW-A/u/c/0.jpg", mime: "image/jpeg", size: 1000, thumbPath: "BW-A/u/c/0.thumb.webp", thumbMime: "image/webp" }],
      [1, { position: 1, path: "BW-A/u/c/1.png", mime: "image/png", size: 2000, thumbPath: null, thumbMime: null }],
    ]);
    const missing = buildAlbumAttachments(items(3), uploads);
    assert.equal(missing.ok, false);
    assert.deepEqual(missing.missing, [1, 2]);
    assert.match(missing.error, /Image 2, 3/);
    const ok = buildAlbumAttachments(items(1), uploads);
    assert.deepEqual(ok.attachments[0], {
      position: 0, path: "BW-A/u/c/0.jpg", mime: "image/jpeg", size: 1000,
      thumb_path: "BW-A/u/c/0.thumb.webp", thumb_mime: "image/webp", width: 1080, height: 1920,
    });
  });
});

describe("gallery layout", () => {
  test("1, 2, 3, 4 tiles; 5+ shows 4 tiles and +N", () => {
    assert.deepEqual(albumLayout(1), { shown: 1, overflow: 0, pattern: "single" });
    assert.deepEqual(albumLayout(2), { shown: 2, overflow: 0, pattern: "pair" });
    assert.deepEqual(albumLayout(3), { shown: 3, overflow: 0, pattern: "feature" });
    assert.deepEqual(albumLayout(4), { shown: 4, overflow: 0, pattern: "grid" });
    assert.deepEqual(albumLayout(8), { shown: 4, overflow: 4, pattern: "grid" });
    assert.deepEqual(albumLayout(10), { shown: 4, overflow: 6, pattern: "grid" });
  });
  test("proof label and count for customers", () => {
    assert.deepEqual(albumCaption({ label: "proof_of_delivery", items: new Array(8) }), { title: "Proof of delivery", countText: "8 screenshots" });
    assert.deepEqual(albumCaption({ label: null, items: new Array(2) }), { title: null, countText: "2 photos" });
    assert.deepEqual(albumCaption({ label: null, items: new Array(1) }), { title: null, countText: null });
  });
});

describe("controlled-concurrency uploads", () => {
  test("never more than the limit at once; all finish; progress reads k of n", async () => {
    let running = 0;
    let peak = 0;
    const progress = [];
    const results = await runUploadQueue(
      Array.from({ length: 8 }, (_, i) => i),
      async (item, _index, onFileProgress) => {
        running += 1;
        peak = Math.max(peak, running);
        onFileProgress(0.5);
        await new Promise((resolve) => setTimeout(resolve, 5 + (item % 3)));
        running -= 1;
        return item * 2;
      },
      { concurrency: UPLOAD_CONCURRENCY, onProgress: (p) => progress.push(p) },
    );
    assert.equal(peak, UPLOAD_CONCURRENCY);
    assert.ok(UPLOAD_CONCURRENCY >= 2 && UPLOAD_CONCURRENCY <= 3);
    assert.deepEqual(results.map((result) => result.value), [0, 2, 4, 6, 8, 10, 12, 14]);
    assert.equal(progress.at(-1).completed, 8);
    assert.equal(progress.at(-1).fraction, 1);
    assert.equal(uploadProgressText({ completed: 3, total: 8 }), "Uploading 4 of 8…");
  });
  test("one failure does not stop the others, and says which", async () => {
    const results = await runUploadQueue(["a", "b", "c"], async (item) => {
      if (item === "b") throw new Error("too large");
      return item;
    });
    assert.deepEqual(results, [{ ok: true, value: "a" }, { ok: false, error: "too large" }, { ok: true, value: "c" }]);
  });
});

describe("album image route (authorization)", () => {
  const attachment = { order_number: "BW-AAAAAA", storage_path: "BW-AAAAAA/u/c/0.jpg", thumb_path: "BW-AAAAAA/u/c/0.thumb.webp" };
  const deps = (viewer) => ({
    loadAttachment: async (id) => (id === CID ? attachment : null),
    resolveViewer: async () => viewer,
    sign: async (path) => `https://signed.example/${path}?token=t`,
  });
  test("owner or admin gets a short-lived link: thumbnail by default, full only when asked", async () => {
    const thumb = await handleAlbumMedia({ attachmentId: CID, size: "thumb", deps: deps({ ok: true }) });
    assert.equal(thumb.status, 302);
    assert.match(thumb.location, /0\.thumb\.webp/);
    const full = await handleAlbumMedia({ attachmentId: CID, size: "full", deps: deps({ ok: true }) });
    assert.match(full.location, /0\.jpg/);
  });
  test("another customer, a signed-out visitor, a bad id: nothing", async () => {
    assert.equal((await handleAlbumMedia({ attachmentId: CID, size: "full", deps: deps({ ok: false, status: 404 }) })).status, 404);
    assert.equal((await handleAlbumMedia({ attachmentId: CID, size: "full", deps: deps({ ok: false, status: 401 }) })).status, 401);
    assert.equal((await handleAlbumMedia({ attachmentId: "../x", size: "full", deps: deps({ ok: true }) })).status, 404);
    assert.equal((await handleAlbumMedia({ attachmentId: "11111111-2222-4333-8444-000000000000", size: "full", deps: deps({ ok: true }) })).status, 404);
  });
  test("a stored path outside its own order folder is never signed", async () => {
    const bad = { ...deps({ ok: true }), loadAttachment: async () => ({ ...attachment, storage_path: "BW-OTHER/u/c/0.jpg" }) };
    assert.equal((await handleAlbumMedia({ attachmentId: CID, size: "full", deps: bad })).status, 404);
  });
});

describe("album messages leave the server without paths", () => {
  test("customer DTO: opaque attachment ids + sizes, label; no storage paths", () => {
    const row = {
      id: "m1", order_number: "BW-A", sender_role: "admin", sender_user_id: "admin-1", kind: "album",
      body: "", payload: { label: "proof_of_delivery" }, created_at: at(0),
    };
    const attachments = new Map([["m1", [
      { id: "a2", message_id: "m1", position: 1, width: 10, height: 20, storage_path: "BW-A/x/1.jpg", thumb_path: "BW-A/x/1.thumb.webp" },
      { id: "a1", message_id: "m1", position: 0, width: 30, height: 40, storage_path: "BW-A/x/0.jpg", thumb_path: "BW-A/x/0.thumb.webp" },
    ]]]);
    const dto = toChatMessage(row, { viewer: "customer", viewerUserId: "cust", attachments });
    assert.deepEqual(dto.album, { label: "proof_of_delivery", items: [{ id: "a1", width: 30, height: 40 }, { id: "a2", width: 10, height: 20 }] });
    const json = JSON.stringify(dto);
    for (const forbidden of ["storage_path", "thumb_path", "BW-A/x", "admin-1"]) assert.equal(json.includes(forbidden), false, forbidden);
  });
});

describe("admin Active / Done queue", () => {
  const ROBERT = "00000000-0000-0000-0000-0000000000a1";
  const row = (orderNumber, minutes, extra = {}) => ({
    conversationId: `c-${orderNumber}`, orderNumber, buyerName: orderNumber, buyerRobloxUsername: "rbx",
    totalAmount: 1, orderCreatedAt: at(0), orderStatus: "pending", assignedAdminId: null, assignedAt: null,
    lastMessageId: `m-${orderNumber}`, lastMessageAt: at(minutes), lastMessageKind: "text", lastMessagePreview: "",
    lastSenderRole: "customer", customerReadAt: null, customerReadMessageId: null, paymentDetailsSentAt: null,
    myReadAt: null, myReadMessageId: null, unreadCount: 0, state: "active", doneAt: null, doneBy: null, ...extra,
  });
  const base = () => createInboxState({ me: ROBERT, rows: [row("BW-A", 1), row("BW-B", 2)] });

  test("the default view is the Active queue", () => {
    assert.equal(base().view.filter, "active");
  });
  test("marking Done removes it from Active at once — even while it is the open chat", () => {
    const event = { conversation_id: "c-BW-A", order_number: "BW-A", assigned_admin_id: null, assigned_by: null, assigned_at: null,
      customer_read_at: null, customer_read_message_id: null, admin_read_at: null, admin_read_message_id: null, state: "done", done_at: at(3), done_by: ROBERT };
    const next = inboxReducer(base(), { type: "conversation_event", event, activeOrderNumber: "BW-A" });
    assert.deepEqual(visibleRows(next).map((r) => r.orderNumber), ["BW-B"]);
  });
  test("in the Done view a reopened chat leaves; in All it stays with its new state", () => {
    const done = createInboxState({ me: ROBERT, rows: [row("BW-A", 1, { state: "done" })], view: { filter: "done" } });
    const reopenEvent = { conversation_id: "c-BW-A", order_number: "BW-A", state: "active" };
    assert.equal(visibleRows(inboxReducer(done, { type: "conversation_event", event: reopenEvent })).length, 0);
    const all = createInboxState({ me: ROBERT, rows: [row("BW-A", 1, { state: "done" })], view: { filter: "all" } });
    assert.equal(visibleRows(inboxReducer(all, { type: "conversation_event", event: reopenEvent }))[0].state, "active");
  });
  test("a customer message to a Done chat that is not in the Active list is fetched as one row", () => {
    const state = createInboxState({ me: ROBERT, rows: [row("BW-B", 2)] });
    const next = inboxReducer(state, {
      type: "message_event",
      event: { conversation_id: "c-BW-A", order_number: "BW-A", is_new_conversation: false,
        message: { id: "m9", sender_role: "customer", sender_user_id: "cust", kind: "text", created_at: at(9), client_message_id: null },
        row: { last_message_id: "m9", last_message_at: at(9), last_message_kind: "text", last_message_preview: "Hello po?", last_sender_role: "customer", payment_details_sent_at: null, state: "active" } },
    });
    assert.deepEqual(next.stale, ["BW-A"]);
    const filled = inboxReducer(next, { type: "upsert_row", row: row("BW-A", 9, { unreadCount: 1 }) });
    assert.deepEqual(visibleRows(filled).map((r) => r.orderNumber), ["BW-A", "BW-B"], "back at the top of Active");
  });
  test("unread / mine / unassigned only ever show Active chats", () => {
    for (const filter of ["unread", "mine", "unassigned"]) {
      const state = createInboxState({
        me: ROBERT,
        rows: [row("BW-A", 1, { state: "done", unreadCount: 2, assignedAdminId: ROBERT }), row("BW-B", 2, { unreadCount: 1, assignedAdminId: ROBERT })],
        view: { filter },
      });
      const next = inboxReducer(state, { type: "upsert_row", row: row("BW-A", 5, { state: "done", unreadCount: 2, assignedAdminId: null }) });
      assert.equal(visibleRows(next).some((r) => r.orderNumber === "BW-A"), false, filter);
    }
  });
});
