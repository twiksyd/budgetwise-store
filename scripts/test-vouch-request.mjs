import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { toChatMessage } from "../src/lib/chat/dto.mjs";
import { quotePreview, quotePreviewFromDto } from "../src/lib/chat/message-meta.mjs";
import { hasVouchRequest, toVouchRequest, VOUCH_FACEBOOK_URL } from "../src/lib/chat/vouch-request.mjs";

const row = {
  id: "00000000-0000-0000-0000-000000000034",
  order_number: "GI-00000034",
  sender_role: "admin",
  sender_user_id: "00000000-0000-0000-0000-0000000000a1",
  kind: "vouch",
  body: "database copy is not rendered by the structured card",
  payload: { url: "https://evil.example", secret: "never expose" },
  attachment_path: null,
  created_at: "2026-10-18T12:00:00.000Z",
};

describe("BudgetWise Vouch Request", () => {
  test("uses only the reviewed Facebook post", () => {
    assert.equal(VOUCH_FACEBOOK_URL, "https://www.facebook.com/share/p/1BiqWAJa36/");
    assert.deepEqual(toVouchRequest(), { facebookUrl: VOUCH_FACEBOOK_URL });
  });

  test("the customer DTO ignores database-controlled payload and admin identity", () => {
    const message = toChatMessage(row, { viewer: "customer", viewerUserId: "customer" });
    assert.deepEqual(message.vouch, { facebookUrl: VOUCH_FACEBOOK_URL });
    assert.equal(message.senderUserId, undefined);
    assert.equal(JSON.stringify(message).includes("evil.example"), false);
    assert.equal(JSON.stringify(message).includes("never expose"), false);
  });

  test("duplicate prevention is reflected in loaded thread state", () => {
    assert.equal(hasVouchRequest([]), false);
    assert.equal(hasVouchRequest([{ kind: "text" }, { kind: "vouch" }]), true);
  });

  test("reply quotes and inbox-safe summaries never contain the link", () => {
    assert.equal(quotePreview(row), "Vouch request");
    assert.equal(quotePreviewFromDto(toChatMessage(row, { viewer: "admin" })), "Vouch request");
  });
});
