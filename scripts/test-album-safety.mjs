// Image validation and abandoned-upload cleanup: pure rules.
// Fixtures in scripts/fixtures/images.json were encoded by Chromium
// (canvas.toBlob) — the same encoder that makes album thumbnails.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { inspectImage, MAX_ATTACHMENT_BYTES, validateAttachmentMeta } from "../src/lib/order-chat.mjs";
import { cleanupOrphanUploads, ORPHAN_RETENTION_HOURS } from "../src/lib/chat/upload-cleanup.mjs";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/images.json", import.meta.url), "utf8"));
const bytes = (name) => new Uint8Array(Buffer.from(fixtures[name], "base64"));

describe("server-side image validation", () => {
  test("real JPG, PNG and WebP (lossy, lossless, extended) are accepted with their true size", () => {
    assert.deepEqual(inspectImage(bytes("png")), { type: "image/png", width: 3, height: 2 });
    assert.deepEqual(inspectImage(bytes("jpeg")), { type: "image/jpeg", width: 3, height: 2 });
    assert.deepEqual(inspectImage(bytes("webp")), { type: "image/webp", width: 3, height: 2 });
    assert.deepEqual(inspectImage(bytes("webpLossless")), { type: "image/webp", width: 3, height: 2 });
    assert.deepEqual(inspectImage(bytes("photoJpeg")), { type: "image/jpeg", width: 640, height: 480 });
    assert.deepEqual(inspectImage(bytes("photoWebp")), { type: "image/webp", width: 640, height: 480 });
    assert.deepEqual(inspectImage(bytes("vp8l")), { type: "image/webp", width: 1, height: 1 });
    assert.deepEqual(inspectImage(bytes("vp8")), { type: "image/webp", width: 1, height: 1 });
  });

  test("a fake PNG (signature, then garbage) is refused", () => {
    const fake = new Uint8Array(4096);
    fake.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(inspectImage(fake), null);
  });

  test("an executable renamed to .jpg is refused", () => {
    const exe = new Uint8Array(4096);
    exe.set([0x4d, 0x5a, 0x90, 0x00]); // "MZ" — Windows PE
    assert.equal(inspectImage(exe), null);
    const elf = new Uint8Array(4096);
    elf.set([0x7f, 0x45, 0x4c, 0x46]);
    assert.equal(inspectImage(elf), null);
  });

  test("an executable behind a JPEG marker (no frame header) is refused", () => {
    const disguised = new Uint8Array(4096);
    disguised.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    disguised.set([0x4d, 0x5a], 2 + 2 + 16);
    assert.equal(inspectImage(disguised), null);
  });

  test("malformed images are refused: truncated, cut header, broken WebP length, zero size", () => {
    const png = bytes("png");
    assert.equal(inspectImage(png.slice(0, png.length - 6)), null, "PNG without its IEND");
    assert.equal(inspectImage(bytes("photoJpeg").slice(0, 60)), null, "JPEG cut before the frame header");
    const webp = bytes("photoWebp");
    assert.equal(inspectImage(webp.slice(0, webp.length - 100)), null, "WebP shorter than its RIFF length");
    const zero = bytes("png").slice();
    zero.fill(0, 16, 24); // width = height = 0
    assert.equal(inspectImage(zero), null, "zero-sized PNG");
    assert.equal(inspectImage(new TextEncoder().encode("<html><script>alert(1)</script></html>")), null);
    assert.equal(inspectImage(null), null);
  });

  test("unsupported types and over-4-MB files are refused before reading the bytes", () => {
    assert.equal(validateAttachmentMeta({ type: "image/gif", size: 100 }).ok, false);
    assert.equal(validateAttachmentMeta({ type: "image/svg+xml", size: 100 }).ok, false);
    assert.equal(validateAttachmentMeta({ type: "application/x-msdownload", size: 100 }).ok, false);
    assert.equal(validateAttachmentMeta({ type: "image/jpeg", size: MAX_ATTACHMENT_BYTES + 1 }).ok, false);
    assert.equal(validateAttachmentMeta({ type: "image/jpeg", size: MAX_ATTACHMENT_BYTES }).ok, true);
    assert.equal(MAX_ATTACHMENT_BYTES, 4 * 1024 * 1024);
  });
});

describe("abandoned upload cleanup", () => {
  const store = (names) => {
    const files = new Map(names.map((name) => [name, { name, created_at: "2026-01-01T00:00:00Z" }]));
    const calls = { list: [], remove: [] };
    return {
      files,
      calls,
      list: async (hours, limit) => {
        calls.list.push({ hours, limit });
        return [...files.values()].slice(0, limit);
      },
      remove: async (names) => {
        calls.remove.push(names);
        for (const name of names) files.delete(name);
      },
    };
  };

  test("removes every listed file in bounded batches, using the 24 h retention", async () => {
    const s = store(Array.from({ length: 1234 }, (_, i) => `BW-X/u/c${i}/0.jpg`));
    const result = await cleanupOrphanUploads({ list: s.list, remove: s.remove });
    assert.deepEqual(result, { listed: 1234, removed: 1234, batches: 3, dryRun: false });
    assert.equal(s.files.size, 0);
    assert.ok(s.calls.list.every((call) => call.hours === ORPHAN_RETENTION_HOURS && call.limit === 500));
    assert.equal(ORPHAN_RETENTION_HOURS, 24);
  });

  test("a dry run deletes nothing", async () => {
    const s = store(["a/0.jpg", "a/0.thumb.webp"]);
    const result = await cleanupOrphanUploads({ list: s.list, remove: s.remove, dryRun: true });
    assert.deepEqual(result, { listed: 2, removed: 0, batches: 1, dryRun: true });
    assert.equal(s.calls.remove.length, 0);
    assert.equal(s.files.size, 2);
  });

  test("nothing to do: no Storage call", async () => {
    const s = store([]);
    assert.deepEqual(await cleanupOrphanUploads({ list: s.list, remove: s.remove }), { listed: 0, removed: 0, batches: 0, dryRun: false });
    assert.equal(s.calls.remove.length, 0);
  });

  test("a Storage failure stops the run (nothing is reported as removed)", async () => {
    const s = store(["a/0.jpg"]);
    await assert.rejects(
      cleanupOrphanUploads({ list: s.list, remove: async () => { throw new Error("storage down"); } }),
      /storage down/,
    );
    assert.equal(s.files.size, 1);
  });

  test("a listing that keeps returning the same files cannot loop forever", async () => {
    const sticky = async () => [{ name: "stuck/0.jpg" }];
    const result = await cleanupOrphanUploads({ list: sticky, remove: async () => {}, batchSize: 1 });
    assert.equal(result.batches, 1);
  });
});
