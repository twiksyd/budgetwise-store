// On-site order chat: the pure rules that guard messages, attachments, and
// the post-login redirect.
import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_LENGTH,
  buildAttachmentPath,
  isUuid,
  isValidOrderNumber,
  previewMessage,
  sanitizeNextPath,
  sniffImageType,
  validateAttachmentMeta,
  validateMessageBody,
} from "../src/lib/order-chat.mjs";

test("message bodies are trimmed and line endings normalised", () => {
  assert.deepEqual(validateMessageBody("  hello\r\nworld  "), {
    ok: true,
    body: "hello\nworld",
  });
});

test("blank messages are rejected unless an image carries them", () => {
  assert.equal(validateMessageBody("   ").ok, false);
  assert.equal(validateMessageBody(undefined).ok, false);
  assert.deepEqual(validateMessageBody("", { allowEmpty: true }), {
    ok: true,
    body: "",
  });
});

test("over-long messages and control characters are rejected", () => {
  assert.equal(validateMessageBody("a".repeat(MAX_MESSAGE_LENGTH)).ok, true);
  assert.equal(validateMessageBody("a".repeat(MAX_MESSAGE_LENGTH + 1)).ok, false);
  assert.equal(validateMessageBody("hi\u0000there").ok, false);
  assert.equal(validateMessageBody(42).ok, false);
  // Tabs and newlines are ordinary whitespace, not control characters.
  assert.equal(validateMessageBody("a\tb\nc").ok, true);
});

test("only jpg, png and webp attachments within the size cap pass", () => {
  assert.deepEqual(validateAttachmentMeta({ type: "image/png", size: 1000 }), {
    ok: true,
    extension: "png",
  });
  assert.equal(validateAttachmentMeta({ type: "image/gif", size: 1000 }).ok, false);
  assert.equal(validateAttachmentMeta({ type: "image/svg+xml", size: 1000 }).ok, false);
  assert.equal(validateAttachmentMeta({ type: "text/html", size: 1000 }).ok, false);
  assert.equal(validateAttachmentMeta({ type: "image/png", size: 0 }).ok, false);
  assert.equal(
    validateAttachmentMeta({ type: "image/jpeg", size: MAX_ATTACHMENT_BYTES }).ok,
    true,
  );
  assert.equal(
    validateAttachmentMeta({ type: "image/jpeg", size: MAX_ATTACHMENT_BYTES + 1 }).ok,
    false,
  );
  // Prototype keys are not file types.
  assert.equal(validateAttachmentMeta({ type: "constructor", size: 10 }).ok, false);
});

test("image type is decided by the bytes, not the claimed type", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  ]);
  const webp = Uint8Array.from([
    ...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"),
  ]);
  const html = Uint8Array.from(Buffer.from("<html><script>1</script></html>"));

  assert.equal(sniffImageType(jpeg), "image/jpeg");
  assert.equal(sniffImageType(png), "image/png");
  assert.equal(sniffImageType(webp), "image/webp");
  assert.equal(sniffImageType(html), null);
  assert.equal(sniffImageType(new Uint8Array(3)), null);
  assert.equal(sniffImageType(null), null);
});

test("post-login redirects stay on this site", () => {
  assert.equal(sanitizeNextPath("/orders/BW-ABC123"), "/orders/BW-ABC123");
  assert.equal(sanitizeNextPath("/checkout?x=1"), "/checkout?x=1");
  assert.equal(sanitizeNextPath("https://evil.example"), "/account/orders");
  assert.equal(sanitizeNextPath("//evil.example"), "/account/orders");
  assert.equal(sanitizeNextPath("/\\evil.example"), "/account/orders");
  assert.equal(sanitizeNextPath("javascript:alert(1)"), "/account/orders");
  assert.equal(sanitizeNextPath("/ok\nSet-Cookie: a=b"), "/account/orders");
  assert.equal(sanitizeNextPath(undefined), "/account/orders");
  assert.equal(sanitizeNextPath(null, "/x"), "/x");
});

test("order numbers and ids are shape-checked before touching the database", () => {
  assert.equal(isValidOrderNumber("BW-A1B2C3"), true);
  assert.equal(isValidOrderNumber("BW-A1B2C3'; drop table"), false);
  assert.equal(isValidOrderNumber("../etc"), false);
  assert.equal(isValidOrderNumber(""), false);
  assert.equal(isUuid("3f2b8c1e-6d1a-4c1e-9f2a-0a1b2c3d4e5f"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});

test("attachments live under their own order's folder", () => {
  assert.equal(
    buildAttachmentPath({ orderNumber: "BW-1", messageId: "abc", extension: "jpg" }),
    "BW-1/abc.jpg",
  );
});

test("inbox previews are one short line", () => {
  assert.equal(previewMessage({ kind: "slip", body: "long slip" }), "Order slip");
  assert.equal(previewMessage({ kind: "image", body: "" }), "📷 Photo");
  assert.equal(previewMessage({ kind: "image", body: "GCash" }), "📷 GCash");
  assert.equal(previewMessage({ kind: "text", body: "a\n\n b" }), "a b");
  assert.equal(previewMessage({ kind: "text", body: "x".repeat(200) }).length, 80);
  assert.equal(previewMessage(null), "");
});
