// Production-readiness checks for 0024: album uploads (idempotency,
// partial retry, cancel, abandoned-upload cleanup, validation, rate limit),
// attachment authorisation, legacy image compatibility, Done/Reopen
// concurrency, the customer completion flow and customer realtime security.
//
// LOCAL ONLY: a local Supabase stack (supabase start, 0024 applied, fresh
// `supabase db reset`) and a production build of this branch:
//   E2E_BASE_URL=http://127.0.0.1:3300 E2E_SUPABASE_SERVICE_ROLE_KEY=... \
//   node --test scripts/e2e/album-integrity.e2e.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { createOrder, line, PASSWORD, USERS, seed } from "./seed-local.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "order-chat-attachments";
// This suite's own customers and orders (the other suites expect theirs fresh).
const A = "BW-E2EIA1"; // custd
const A2 = "BW-E2EIA2"; // custd, second order
const B = "BW-E2EIB1"; // custe
const C = "BW-E2EIC1"; // custf (Done/Reopen tests, own rate-limit budget)
const C2 = "BW-E2EIC2"; // custf (rate-limit test)

const fixtures = JSON.parse(readFileSync(new URL("../fixtures/images.json", import.meta.url), "utf8"));
const IMAGE = { b64: fixtures.photoJpeg, mime: "image/jpeg" };
const THUMB = { b64: fixtures.webp, mime: "image/webp" };

let browser;
let ids;
const people = {};
const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function sql(query, params) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await client.connect();
  try {
    return (await client.query(query, params)).rows;
  } finally {
    await client.end();
  }
}

async function signIn(key) {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(USERS[key].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/admin/login") || url.search.includes("denied"));
  return { context, page };
}

/** fetch() from inside the signed-in page (same origin, real cookies). */
async function api(who, path, init = {}) {
  return people[who].page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, { ...init, redirect: "manual" });
      return {
        status: response.status,
        type: response.type,
        location: response.headers.get("location"),
        text: response.type === "opaqueredirect" ? "" : await response.text(),
      };
    },
    { path, init },
  );
}
const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const parse = (result) => {
  try {
    return JSON.parse(result.text);
  } catch {
    return null;
  }
};

/** One album image upload exactly as the browser sends it. */
async function upload(who, orderNumber, clientMessageId, position, file = IMAGE, thumb = THUMB, as = null) {
  const role = as ?? (USERS[who].admin ? "admin" : "customer");
  return people[who].page.evaluate(
    async ({ orderNumber, clientMessageId, position, file, thumb, role }) => {
      const blob = (b64, type) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
      const form = new FormData();
      form.set("clientMessageId", clientMessageId);
      form.set("position", String(position));
      form.set("file", new File([blob(file.b64, file.mime)], file.name ?? `${position}.img`, { type: file.mime }));
      form.set("thumb", new File([blob(thumb.b64, thumb.mime)], `${position}.thumb`, { type: thumb.mime }));
      const response = await fetch(`/api/order-chat/${orderNumber}/uploads?as=${role}`, { method: "POST", body: form });
      return { status: response.status, text: await response.text() };
    },
    { orderNumber, clientMessageId, position, file, thumb, role },
  );
}

function postAlbum(who, orderNumber, clientMessageId, count, extra = {}) {
  const role = USERS[who].admin ? "admin" : "customer";
  return api(
    who,
    `/api/order-chat/${orderNumber}/messages?as=${role}`,
    json({
      kind: "album",
      clientMessageId,
      body: extra.body ?? "",
      label: extra.label ?? null,
      items: Array.from({ length: count }, (_, position) => ({ position, width: 640, height: 480, ...(extra.item ?? {}) })),
    }),
  );
}

async function sendAlbum(who, orderNumber, count, extra) {
  const cid = crypto.randomUUID();
  for (let position = 0; position < count; position += 1) {
    const result = await upload(who, orderNumber, cid, position);
    assert.equal(result.status, 201, result.text);
  }
  const posted = await postAlbum(who, orderNumber, cid, count, extra);
  assert.equal(posted.status, 201, posted.text);
  return { cid, message: parse(posted).message };
}

const folderOf = (orderNumber, who, cid) => `${orderNumber}/${ids[who]}/${cid}/`;
async function objectsIn(prefix) {
  return sql(
    `select name, id, created_at, (metadata->>'size')::int as size from storage.objects
      where bucket_id = $1 and name like $2 order by name`,
    [BUCKET, `${prefix}%`],
  );
}
async function counts(orderNumber, who, cid) {
  const [row] = await sql(
    `select (select count(*)::int from store_order_messages where order_number = $1 and sender_user_id = $2 and client_message_id = $3) as messages,
            (select count(*)::int from store_order_message_attachments x join store_order_messages m on m.id = x.message_id
              where m.order_number = $1 and m.sender_user_id = $2 and m.client_message_id = $3) as attachments,
            (select count(*)::int from store_order_messages where order_number = $1 and kind = 'album') as albums`,
    [orderNumber, ids[who], cid],
  );
  return { ...row, files: (await objectsIn(folderOf(orderNumber, who, cid))).length };
}
async function lastMessageId(orderNumber) {
  const [row] = await sql(
    "select id from store_order_messages where order_number = $1 order by created_at desc, id desc limit 1",
    [orderNumber],
  );
  return row.id;
}
const customerSays = (who, orderNumber, body) =>
  api(who, `/api/order-chat/${orderNumber}/messages?as=customer`, json({ body, clientMessageId: crypto.randomUUID() }));
const setState = (who, orderNumber, state, lastSeenMessageId) =>
  api(who, `/api/admin/orders/${orderNumber}/state`, json({ state, lastSeenMessageId }));

/** A realtime client signed in as `who` (or anonymous). */
async function realtimeClient(who) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (who) {
    const { error } = await client.auth.signInWithPassword({ email: USERS[who].email, password: PASSWORD });
    if (error) throw error;
  }
  await client.realtime.setAuth();
  return client;
}
function listen(client, topic, { isPrivate = true } = {}) {
  const received = [];
  const channel = client.channel(topic, { config: { private: isPrivate } });
  channel.on("broadcast", { event: "*" }, (message) => received.push({ event: message.event, payload: message.payload }));
  const status = new Promise((resolve) => {
    channel.subscribe((value, error) => {
      if (value === "SUBSCRIBED" || value === "CHANNEL_ERROR" || value === "TIMED_OUT") resolve({ value, error: error?.message ?? null });
    });
  });
  return { channel, received, status };
}
const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await settle(150);
  }
  assert.fail(`timed out: ${label}`);
}

before(async () => {
  ids = await seed();
  const order = (owner, name, roblox) => [owner, name, roblox, [line(0, "33333333-3333-3333-3333-333333333333", "Blox Fruits", "Dragon", 0, 1, 499)]];
  for (const [orderNumber, args] of [
    [A, order(ids.custd, "Ana Cruz", "anaRBX")],
    [A2, order(ids.custd, "Ana Cruz", "anaRBX")],
    [B, order(ids.custe, "Ben Lim", "benRBX")],
    [C, order(ids.custf, "Carla Tan", "carlaRBX")],
    [C2, order(ids.custf, "Carla Tan", "carlaRBX")],
  ]) {
    await createOrder(orderNumber, ...args);
  }
  browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM ?? "/opt/pw-browsers/chromium" });
  // Admin uploads go through Kenneth so the per-person upload limiter never
  // carries over into the other suites (they upload as Robert).
  for (const key of ["custd", "custe", "custf", "robert", "andre", "kenneth"]) people[key] = await signIn(key);
});
after(async () => {
  await browser?.close();
});

describe("album idempotency", () => {
  test("double-click Send (two posts at once) creates ONE album", async () => {
    const cid = crypto.randomUUID();
    for (let p = 0; p < 4; p += 1) assert.equal((await upload("custd", A, cid, p)).status, 201);
    const results = await Promise.all([postAlbum("custd", A, cid, 4), postAlbum("custd", A, cid, 4)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201], results.map((r) => r.text).join(" | "));
    assert.equal(parse(results[0]).message.id, parse(results[1]).message.id);
    const c = await counts(A, "custd", cid);
    assert.deepEqual({ m: c.messages, a: c.attachments, f: c.files }, { m: 1, a: 4, f: 8 });
  });

  test("repeated submit, timeout retry and reconnect retry with the same id: still one album", async () => {
    const { cid, message } = await sendAlbum("custd", A, 3);
    const albumsBefore = (await counts(A, "custd", cid)).albums;
    // repeated submit / a retry after a lost (timed-out) response
    for (let i = 0; i < 5; i += 1) {
      const again = await postAlbum("custd", A, cid, 3);
      assert.equal(again.status, 200, again.text);
      assert.equal(parse(again).message.id, message.id);
    }
    // reconnect retry: the client re-sends its uploads, then the post
    const filesBefore = await objectsIn(folderOf(A, "custd", cid));
    for (let p = 0; p < 3; p += 1) {
      const reupload = await upload("custd", A, cid, p);
      assert.equal(reupload.status, 409, "uploads into an already-posted album are refused");
    }
    assert.equal((await postAlbum("custd", A, cid, 3)).status, 200);
    const filesAfter = await objectsIn(folderOf(A, "custd", cid));
    assert.deepEqual(filesAfter.map((f) => f.id), filesBefore.map((f) => f.id), "no file replaced or added");
    const c = await counts(A, "custd", cid);
    assert.deepEqual({ m: c.messages, a: c.attachments, f: c.files, albums: c.albums }, { m: 1, a: 3, f: 6, albums: albumsBefore });
  });

  test("proof of delivery: double send by an admin is one proof album", async () => {
    const cid = crypto.randomUUID();
    for (let p = 0; p < 2; p += 1) assert.equal((await upload("kenneth", A, cid, p)).status, 201);
    const results = await Promise.all([
      postAlbum("kenneth", A, cid, 2, { label: "proof_of_delivery" }),
      postAlbum("kenneth", A, cid, 2, { label: "proof_of_delivery" }),
      postAlbum("kenneth", A, cid, 2, { label: "proof_of_delivery" }),
    ]);
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 200).length, 2);
    const [row] = await sql(
      `select count(*)::int as n from store_order_messages where order_number = $1 and client_message_id = $2 and payload->>'label' = 'proof_of_delivery'`,
      [A, cid],
    );
    assert.equal(row.n, 1);
  });

  test("the same client id reused for different content is refused (409), never merged", async () => {
    const { cid } = await sendAlbum("custd", A, 2);
    const reused = await postAlbum("custd", A, cid, 2, { body: "different caption" });
    assert.equal(reused.status, 409, reused.text);
    assert.equal((await counts(A, "custd", cid)).messages, 1);
  });
});

describe("partial retry", () => {
  test("8 images, 7 upload, 1 fails: only the failed one is re-sent; the 7 are reused, not re-uploaded", async () => {
    const cid = crypto.randomUUID();
    for (let p = 0; p < 7; p += 1) assert.equal((await upload("custd", A, cid, p)).status, 201);
    const broken = { b64: Buffer.from("not an image at all, just text").toString("base64"), mime: "image/png", name: "IMG_0008.png" };
    const failed = await upload("custd", A, cid, 7, broken);
    assert.equal(failed.status, 400);
    const kept = await objectsIn(folderOf(A, "custd", cid));
    assert.equal(kept.length, 14);

    const early = await postAlbum("custd", A, cid, 8);
    assert.equal(early.status, 409);
    assert.deepEqual(parse(early).missing, [7], "the server names the image that is missing");
    assert.equal((await counts(A, "custd", cid)).messages, 0, "nothing posted yet");

    assert.equal((await upload("custd", A, cid, 7)).status, 201, "retry: only image 8");
    const posted = await postAlbum("custd", A, cid, 8);
    assert.equal(posted.status, 201, posted.text);
    assert.equal((await postAlbum("custd", A, cid, 8)).status, 200, "and a duplicate post is still one album");

    const final = await objectsIn(folderOf(A, "custd", cid));
    const unchanged = final.filter((f) => kept.some((k) => k.id === f.id && +k.created_at === +f.created_at));
    assert.equal(unchanged.length, 14, "the 7 successful images (and thumbnails) are the original objects");
    assert.equal(final.length, 16);
    const c = await counts(A, "custd", cid);
    assert.deepEqual({ m: c.messages, a: c.attachments }, { m: 1, a: 8 });
  });

  test("a re-upload of an already-stored image never replaces it (write-once)", async () => {
    const cid = crypto.randomUUID();
    assert.equal((await upload("custd", A, cid, 0)).status, 201);
    const [first] = await objectsIn(`${folderOf(A, "custd", cid)}0.jpg`);
    const other = { b64: fixtures.jpeg, mime: "image/jpeg" };
    assert.equal((await upload("custd", A, cid, 0, other)).status, 201, "a retry is accepted…");
    const [still] = await objectsIn(`${folderOf(A, "custd", cid)}0.jpg`);
    assert.equal(still.id, first.id, "…but the stored object is untouched");
    assert.equal(still.size, first.size);
  });
});

describe("cancel and abandoned uploads", () => {
  test("cancel after 3 of 10 uploaded: server deletes the 3 (and thumbnails); nothing can be posted", async () => {
    const cid = crypto.randomUUID();
    for (let p = 0; p < 3; p += 1) assert.equal((await upload("custd", A, cid, p)).status, 201);
    assert.equal((await objectsIn(folderOf(A, "custd", cid))).length, 6);
    const cancel = await api("custd", `/api/order-chat/${A}/uploads?as=customer&clientMessageId=${cid}`, { method: "DELETE" });
    assert.equal(cancel.status, 200, cancel.text);
    assert.equal(parse(cancel).deleted, 6);
    assert.equal((await objectsIn(folderOf(A, "custd", cid))).length, 0);
    assert.equal((await postAlbum("custd", A, cid, 3)).status, 409);
  });

  test("cancel cannot touch a posted album or someone else's uploads", async () => {
    const { cid } = await sendAlbum("custd", A, 2);
    const late = await api("custd", `/api/order-chat/${A}/uploads?as=customer&clientMessageId=${cid}`, { method: "DELETE" });
    assert.equal(late.status, 409);
    assert.equal((await objectsIn(folderOf(A, "custd", cid))).length, 4, "posted files intact");

    const pending = crypto.randomUUID();
    assert.equal((await upload("custd", A, pending, 0)).status, 201);
    const other = await api("custe", `/api/order-chat/${A}/uploads?as=customer&clientMessageId=${pending}`, { method: "DELETE" });
    assert.equal(other.status, 404, "customer B cannot even address A's order");
    assert.equal((await objectsIn(folderOf(A, "custd", pending))).length, 2);
  });

  test("cleanup script: removes abandoned uploads past 24 h, keeps fresh ones and every posted file", async () => {
    const posted = await sendAlbum("custd", A, 2);
    const abandoned = crypto.randomUUID();
    const fresh = crypto.randomUUID();
    for (let p = 0; p < 2; p += 1) {
      assert.equal((await upload("custd", A, abandoned, p)).status, 201);
      assert.equal((await upload("custd", A, fresh, p)).status, 201);
    }
    // Age the abandoned upload and the posted album's files to 25 hours.
    await sql(`update storage.objects set created_at = now() - interval '25 hours' where bucket_id = $1 and (name like $2 or name like $3)`, [
      BUCKET,
      `${folderOf(A, "custd", abandoned)}%`,
      `${folderOf(A, "custd", posted.cid)}%`,
    ]);
    // The stale upload can no longer be posted (so cleanup cannot race a post).
    const stale = await postAlbum("custd", A, abandoned, 2);
    assert.equal(stale.status, 410, stale.text);

    const run = promisify(execFile);
    const env = { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
    const dry = await run("node", ["scripts/cleanup-chat-uploads.mjs"], { env });
    assert.match(dry.stdout, /Dry run: [1-9]\d* abandoned upload/);
    assert.equal((await objectsIn(folderOf(A, "custd", abandoned))).length, 4, "dry run deletes nothing");
    const real = await run("node", ["scripts/cleanup-chat-uploads.mjs", "--delete"], { env });
    assert.match(real.stdout, /Removed [1-9]\d* abandoned upload/);

    assert.equal((await objectsIn(folderOf(A, "custd", abandoned))).length, 0, "abandoned files deleted");
    const { data: listed } = await service.storage.from(BUCKET).list(folderOf(A, "custd", abandoned).replace(/\/$/, ""));
    assert.equal(listed.length, 0, "…in Storage itself, not just the table");
    assert.equal((await objectsIn(folderOf(A, "custd", fresh))).length, 4, "uploads under 24 h are kept");
    assert.equal((await objectsIn(folderOf(A, "custd", posted.cid))).length, 4, "posted album files are kept");
    const thumb = await api("custd", `/api/order-chat/media/${posted.message.album.items[0].id}?size=thumb`);
    assert.equal(thumb.type, "opaqueredirect", "the posted album still opens");

    const guarded = await run("node", ["scripts/cleanup-chat-uploads.mjs"], {
      env: { ...env, SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" },
    }).catch((error) => error);
    assert.equal(guarded.code, 2, "a remote project needs an explicit --project-ref");
  });
});

describe("attachment authorisation", () => {
  let albumA;
  let albumA2;
  before(async () => {
    albumA = await sendAlbum("custd", A, 2);
    albumA2 = await sendAlbum("custd", A2, 1);
  });

  test("customer A sees own images through a short-lived signed URL; thumbnail and full alike", async () => {
    for (const size of ["thumb", "full"]) {
      const response = await people.custd.context.request.get(`/api/order-chat/media/${albumA.message.album.items[0].id}?size=${size}`, { maxRedirects: 0 });
      assert.equal(response.status(), 302);
      assert.equal(response.headers()["cache-control"], "private, no-store");
      const location = response.headers().location;
      assert.match(location, /\/storage\/v1\/object\/sign\/order-chat-attachments\//);
      const token = new URL(location).searchParams.get("token");
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      assert.equal(claims.exp - claims.iat, 60, "signed for 60 seconds");
      assert.match(claims.url, size === "thumb" ? /\/0\.thumb\.webp$/ : /\/0\.jpg$/);
      const image = await fetch(location);
      assert.equal(image.status, 200);
    }
  });

  test("customer B: no metadata, no thumbnail, no original of A's images", async () => {
    const messages = await api("custe", `/api/order-chat/${A}/messages?as=customer`);
    assert.equal(messages.status, 404);
    for (const size of ["thumb", "full"]) {
      const media = await api("custe", `/api/order-chat/media/${albumA.message.album.items[0].id}?size=${size}`);
      assert.equal(media.status, 404, `B ${size}`);
    }
    const signedOut = await fetch(`${BASE}/api/order-chat/media/${albumA.message.album.items[0].id}?size=full`, { redirect: "manual" });
    assert.equal(signedOut.status, 401);
    const stranger = await api("custf", `/api/order-chat/media/${albumA.message.album.items[0].id}?size=thumb`);
    assert.equal(stranger.status, 404, "a signed-in non-owner, non-admin");
  });

  test("B cannot use A's attachment, claim A's pending upload, or pass storage paths", async () => {
    // A's posted album id and a pending upload of A's, both under A's folder.
    const pending = crypto.randomUUID();
    assert.equal((await upload("custd", A, pending, 0)).status, 201);
    for (const cid of [albumA.cid, pending]) {
      const intoOwn = await postAlbum("custe", B, cid, 1);
      assert.equal(intoOwn.status, 409, "B's album only ever looks in B's own folder");
      const intoA = await postAlbum("custe", A, cid, 1);
      assert.equal(intoA.status, 404, "B cannot post into A's order");
    }
    const withPaths = await postAlbum("custe", B, crypto.randomUUID(), 1, {
      item: { path: `${folderOf(A, "custd", pending)}0.jpg`, thumb_path: `${folderOf(A, "custd", pending)}0.thumb.webp`, storage_path: "x" },
    });
    assert.equal(withPaths.status, 409, "paths in the request are ignored; nothing was uploaded by B");
    const [{ n }] = await sql(
      "select count(*)::int as n from store_order_message_attachments x join store_order_messages m on m.id = x.message_id where m.order_number = $1",
      [B],
    );
    assert.equal(n, 0);
  });

  test("an attachment from another order cannot be reused", async () => {
    const crossed = await postAlbum("custd", A, albumA2.cid, 1);
    assert.equal(crossed.status, 409, `album ${albumA2.cid} belongs to ${A2}`);
    const media = await api("custe", `/api/order-chat/media/${albumA2.message.album.items[0].id}?size=thumb`);
    assert.equal(media.status, 404);
  });

  test("no arbitrary storage path can be requested", async () => {
    for (const path of [
      `/api/order-chat/media/${encodeURIComponent(`${A}/${ids.custd}/${albumA.cid}/0.jpg`)}`,
      "/api/order-chat/media/..%2F..%2Fstore-payment-qr%2Fqr.png",
      "/api/order-chat/media/not-a-uuid",
      `/api/order-chat/media/${crypto.randomUUID()}?size=full`,
      `/api/order-chat/attachments/${encodeURIComponent(`${A}/x.png`)}`,
    ]) {
      const result = await api("custd", path);
      assert.equal(result.status, 404, path);
    }
    const sizeTrick = await people.custd.context.request.get(
      `/api/order-chat/media/${albumA.message.album.items[0].id}?size=..%2F..%2Fother`,
      { maxRedirects: 0 },
    );
    assert.match(sizeTrick.headers().location, /\.thumb\.webp/, "an unknown size means the thumbnail");
  });

  test("admins need a real admin session; ?as=admin from a customer is refused", async () => {
    const admin = await api("robert", `/api/order-chat/media/${albumA.message.album.items[1].id}?size=full`);
    assert.equal(admin.type, "opaqueredirect");
    const pretend = await api("custe", `/api/order-chat/${A}/messages?as=admin`);
    assert.equal(pretend.status, 403);
    const pretendUpload = await upload("custe", A, crypto.randomUUID(), 0, IMAGE, THUMB, "admin");
    assert.equal(pretendUpload.status, 403);
    const pretendState = await setState("custe", A, "done", await lastMessageId(A));
    assert.ok([401, 403].includes(pretendState.status), pretendState.text);
  });

  test("customer JSON never contains storage paths or admin identities", async () => {
    await sendAlbum("kenneth", A, 2, { label: "proof_of_delivery" });
    for (const path of [`/api/order-chat/${A}/messages?as=customer`, "/api/account/conversations", "/api/account/orders?section=open", `/api/order-chat/${A}/summary`]) {
      const result = await api("custd", path);
      assert.equal(result.status, 200, path);
      assert.doesNotMatch(result.text, /order-chat-attachments|storage_path|thumb_path|\.thumb\.|attachment_path/, path);
      assert.doesNotMatch(result.text, new RegExp(`${ids.custd}/|${ids.robert}|${ids.andre}|${ids.kenneth}`), path);
    }
    const album = parse(await api("custd", `/api/order-chat/${A}/messages?as=customer`)).messages.find((m) => m.album?.label === "proof_of_delivery");
    assert.deepEqual(Object.keys(album.album.items[0]).sort(), ["height", "id", "width"]);
  });

  test("stored paths follow <order>/<sender>/<client id>/<n>.<ext> and <n>.thumb.<ext>", async () => {
    const rows = await sql("select storage_path, thumb_path from store_order_message_attachments");
    assert.ok(rows.length > 0);
    const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    for (const row of rows) {
      assert.match(row.storage_path, new RegExp(`^BW-[A-Z0-9]+/${uuid}/${uuid}/\\d\\.(jpg|png|webp)$`));
      assert.match(row.thumb_path, new RegExp(`^BW-[A-Z0-9]+/${uuid}/${uuid}/\\d\\.thumb\\.(jpg|png|webp)$`));
    }
  });
});

describe("existing images keep working after 0024", () => {
  test("old single-image messages and receipts (both historical path formats) still render", async () => {
    const png = Buffer.from(fixtures.png, "base64");
    const legacy = [
      { path: `${A}/${ids.custd}/${crypto.randomUUID()}.png`, body: "GCash receipt (pre-0024 client)" },
      { path: `${A}/${crypto.randomUUID()}.png`, body: "receipt (0020 path format)" },
    ];
    for (const item of legacy) {
      const { error } = await service.storage.from(BUCKET).upload(item.path, png, { contentType: "image/png" });
      if (error) throw error;
      await sql(
        `insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, attachment_path, attachment_mime)
         values ($1, 'customer', $2, 'image', $3, $4, 'image/png')`,
        [A, ids.custd, item.body, item.path],
      );
    }
    const list = parse(await api("custd", `/api/order-chat/${A}/messages?as=customer`)).messages;
    for (const item of legacy) {
      const message = list.find((m) => m.body === item.body);
      assert.ok(message, item.body);
      assert.equal(message.kind, "image");
      assert.equal(message.hasAttachment, true);
      assert.equal(message.album, null);
      for (const who of ["custd", "robert"]) {
        const response = await people[who].context.request.get(`/api/order-chat/attachments/${message.id}`, { maxRedirects: 0 });
        assert.equal(response.status(), 302, `${who}: ${item.body}`);
        assert.equal((await fetch(response.headers().location)).status, 200);
      }
      assert.equal((await api("custe", `/api/order-chat/attachments/${message.id}`)).status, 404);
    }
    const [{ n }] = await sql(
      "select count(*)::int as n from store_order_message_attachments x join store_order_messages m on m.id = x.message_id where m.kind <> 'album'",
    );
    assert.equal(n, 0, "albums use the new table only; image messages keep their single path");
  });

  test("the legacy single-image send path still works (and is write-once too)", async () => {
    const cid = crypto.randomUUID();
    const send = () =>
      people.custd.page.evaluate(
        async ({ b64, cid, order }) => {
          const form = new FormData();
          form.set("body", "legacy single image");
          form.set("clientMessageId", cid);
          form.set("file", new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "r.png", { type: "image/png" }));
          const response = await fetch(`/api/order-chat/${order}/messages?as=customer`, { method: "POST", body: form });
          return { status: response.status, text: await response.text() };
        },
        { b64: fixtures.png, cid, order: A },
      );
    assert.equal((await send()).status, 201);
    assert.equal((await send()).status, 200, "retry returns the same message");
    const [{ n }] = await sql("select count(*)::int as n from store_order_messages where client_message_id = $1", [cid]);
    assert.equal(n, 1);
  });
});

describe("Done / Reopen concurrency", () => {
  test("Robert at message 50, customer sends 51, Robert clicks Done: stays Active, 51 kept and unread", async () => {
    await setState("robert", C, "active", null);
    for (let i = 0; i < 48; i += 1) {
      await sql(
        `insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
         values ($1, $2, $3, 'text', $4, now() - interval '1 hour' + $5 * interval '1 second')`,
        [C, i % 2 ? "admin" : "customer", i % 2 ? ids.andre : ids.custf, `history ${i + 1}`, i],
      );
    }
    const seen = await lastMessageId(C); // what Robert has on screen ("message 50")
    await api("robert", `/api/order-chat/${C}/read?as=admin`, json({ messageId: seen }));
    const sent = await customerSays("custf", C, "message 51: may tanong pa po");
    assert.equal(sent.status, 201);
    const done = await setState("robert", C, "done", seen);
    assert.equal(done.status, 409, done.text);
    assert.match(parse(done).error, /new message/i);
    const [conv] = await sql("select state, done_at from store_order_conversations where order_number = $1", [C]);
    assert.deepEqual(conv, { state: "active", done_at: null });
    const inbox = parse(await api("robert", `/api/admin/inbox?filter=active&search=${C}`));
    const row = inbox.rows.find((r) => r.orderNumber === C);
    assert.ok(row, "still in Robert's Active queue");
    assert.equal(row.unreadCount, 1, "message 51 is unread for Robert");
    const thread = parse(await api("robert", `/api/order-chat/${C}/messages?as=admin`));
    assert.equal(thread.messages.at(-1).body, "message 51: may tanong pa po", "Robert's next load shows it");
  });

  test("exact lock ordering: Done commits first, then the customer message reopens it (and vice versa)", async () => {
    const { default: pg } = await import("pg");
    const url = process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const admin = new pg.Client({ connectionString: url });
    const customer = new pg.Client({ connectionString: url });
    await admin.connect();
    await customer.connect();
    try {
      // 1. Robert's Done holds the row lock; the customer's message waits, then reopens.
      const seen = await lastMessageId(C);
      await admin.query("begin");
      await admin.query("select store_set_conversation_state($1, $2, 'done', $3)", [C, ids.robert, seen]);
      await customer.query("begin");
      const waiting = customer.query(
        "select store_post_message($1, 'customer', $2, 'text', 'sent while Done was saving', null, null, gen_random_uuid())",
        [C, ids.custf],
      );
      await settle(300);
      await admin.query("commit");
      await waiting;
      await customer.query("commit");
      let [conv] = await sql("select state from store_order_conversations where order_number = $1", [C]);
      assert.equal(conv.state, "active", "the message that raced Done reopened it");
      const [audit] = await sql(
        `select count(*)::int as n from store_chat_audit_log where order_number = $1 and action = 'conversation.reopened' and details->>'cause' = 'customer_message'
           and created_at > now() - interval '1 minute'`,
        [C],
      );
      assert.ok(audit.n >= 1);

      // 2. The customer's message holds the lock first; Done waits, then refuses.
      const seen2 = await lastMessageId(C);
      await customer.query("begin");
      await customer.query(
        "select store_post_message($1, 'customer', $2, 'text', 'sent just before Done', null, null, gen_random_uuid())",
        [C, ids.custf],
      );
      const doneWaiting = admin.query("select store_set_conversation_state($1, $2, 'done', $3)", [C, ids.robert, seen2]).then(
        () => "done",
        (error) => error.code,
      );
      await settle(300);
      await customer.query("commit");
      assert.equal(await doneWaiting, "BW011");
      [conv] = await sql("select state from store_order_conversations where order_number = $1", [C]);
      assert.equal(conv.state, "active");
    } finally {
      await admin.end();
      await customer.end();
    }
  });

  test("Robert marks Done, Andre reopens and the customer writes — all at once, 15 rounds: no message lost, never left Done", async () => {
    for (let round = 0; round < 15; round += 1) {
      const seen = await lastMessageId(C);
      const body = `race round ${round}`;
      const [done, reopen, message] = await Promise.all([
        setState("robert", C, "done", seen),
        setState("andre", C, "active", null),
        customerSays("custf", C, body),
      ]);
      assert.ok([200, 409].includes(done.status), done.text);
      assert.equal(reopen.status, 200, reopen.text);
      assert.equal(message.status, 201, message.text);
      const [row] = await sql(
        `select c.state, c.done_at, (select count(*)::int from store_order_messages m where m.order_number = c.order_number and m.body = $2) as kept
           from store_order_conversations c where c.order_number = $1`,
        [C, body],
      );
      assert.equal(row.kept, 1, `round ${round}: the customer message is saved exactly once`);
      assert.equal(row.state, "active", `round ${round}: a customer message after (or during) Done leaves it Active`);
      assert.equal(row.done_at, null);
    }
    const [{ bad }] = await sql(
      `select count(*)::int as bad from store_order_conversations where (state = 'done') <> (done_at is not null)`,
    );
    assert.equal(bad, 0);
  });
});

describe("customer completion state, realtime and security", () => {
  let convA;
  let convB;
  before(async () => {
    [{ id: convA }] = await sql("select id from store_order_conversations where order_number = $1", [A]);
    [{ id: convB }] = await sql("select id from store_order_conversations where order_number = $1", [B]);
  });

  test("Done → admins Done, customer Completed; customer writes → Active / In progress; XOB status untouched", async () => {
    const xobBefore = await sql("select order_number, status from orders order by order_number");
    const [{ id: convC }] = await sql("select id from store_order_conversations where order_number = $1", [C]);
    const custd = await realtimeClient("custf");
    const robert = await realtimeClient("robert");
    const customerTopic = listen(custd, `customer:${ids.custf}`);
    const chatTopic = listen(custd, `chat:${convC}`);
    const inbox = listen(robert, "admin:inbox");
    assert.equal((await customerTopic.status).value, "SUBSCRIBED");
    assert.equal((await chatTopic.status).value, "SUBSCRIBED");
    assert.equal((await inbox.status).value, "SUBSCRIBED");
    try {
      const done = await setState("robert", C, "done", await lastMessageId(C));
      assert.equal(done.status, 200, done.text);
      await waitFor(() => inbox.received.some((e) => e.event === "conversation" && e.payload.order_number === C && e.payload.state === "done"), "admin Done event");
      await waitFor(() => chatTopic.received.some((e) => e.event === "state" && e.payload.state === "done"), "customer chat state event");
      await waitFor(() => customerTopic.received.some((e) => e.event === "conversation" && e.payload.state === "done"), "customer topic event");
      assert.equal(parse(await api("custf", `/api/order-chat/${C}/summary`)).summary.state, "done", "customer: Completed");
      const page = people.custf.page;
      await page.goto(`/orders/${C}`);
      await page.getByText("Completed ✓").first().waitFor();

      inbox.received.length = 0;
      customerTopic.received.length = 0;
      assert.equal((await customerSays("custf", C, "after Completed: one more question")).status, 201);
      await waitFor(() => inbox.received.some((e) => e.event === "conversation" && e.payload.order_number === C && e.payload.state === "active"), "admin reopen event");
      await waitFor(() => inbox.received.some((e) => e.event === "message" && e.payload.row?.state === "active"), "admin message event with state");
      await waitFor(() => customerTopic.received.some((e) => e.event === "conversation" && e.payload.state === "active"), "customer reopen event");
      assert.equal(parse(await api("custf", `/api/order-chat/${C}/summary`)).summary.state, "active", "customer: In progress");
      await page.getByText("Completed ✓").first().waitFor({ state: "detached" });

      assert.deepEqual(await sql("select order_number, status from orders order by order_number"), xobBefore, "orders.status never changed");
    } finally {
      await custd.removeAllChannels();
      await robert.removeAllChannels();
    }
  });

  test("private customer topic: A receives A only; B, anonymous and admins are refused; nobody can publish", async (t) => {
    const custd = await realtimeClient("custd");
    const custaSecond = await realtimeClient("custd");
    const custe = await realtimeClient("custe");
    const anon = await realtimeClient(null);
    const robert = await realtimeClient("robert");
    try {
      const own = listen(custd, `customer:${ids.custd}`);
      const ownChat = listen(custd, `chat:${convA}`);
      const peek = listen(custd, `customer:${ids.custe}`);
      const peekChat = listen(custd, `chat:${convB}`);
      const anonPeek = listen(anon, `customer:${ids.custd}`);
      const adminPeek = listen(robert, `customer:${ids.custd}`);
      const witness = listen(custaSecond, `customer:${ids.custd}`);
      assert.equal((await own.status).value, "SUBSCRIBED");
      assert.equal((await ownChat.status).value, "SUBSCRIBED");
      assert.equal((await witness.status).value, "SUBSCRIBED");
      for (const [label, sub] of [["B's topic", peek], ["B's chat", peekChat], ["anonymous", anonPeek], ["admin on customer topic", adminPeek]]) {
        const { value } = await sub.status;
        assert.notEqual(value, "SUBSCRIBED", `${label} must not subscribe`);
      }

      // Forgery attempts: on the private channel, and on a public channel of the same name.
      const forged = { conversation_id: convA, order_number: A, state: "done", unread_count: 99 };
      const sendResult = await own.channel.send({ type: "broadcast", event: "conversation", payload: forged });
      const publicForger = listen(custe, `customer:${ids.custd}`, { isPrivate: false });
      await publicForger.status;
      await publicForger.channel.send({ type: "broadcast", event: "conversation", payload: forged });
      const anonForger = listen(anon, `chat:${convA}`, { isPrivate: false });
      await anonForger.status;
      await anonForger.channel.send({ type: "broadcast", event: "state", payload: { state: "done" } });

      // A real event for A (an admin album) and one for B.
      witness.received.length = 0;
      ownChat.received.length = 0;
      await sendAlbum("kenneth", A, 2, { label: "proof_of_delivery" });
      await customerSays("custe", B, "B's own message");
      await waitFor(() => witness.received.some((e) => e.event === "message"), "A gets its real event");
      await settle();

      t.diagnostic(`private send by the customer: ${sendResult}`);
      t.diagnostic(`public forger channel: ${(await publicForger.status).value}; anonymous public forger: ${(await anonForger.status).value}`);
      for (const [label, sub] of [["A on B's topic", peek], ["A on B's chat", peekChat], ["anonymous on A's topic", anonPeek], ["admin on A's topic", adminPeek]]) {
        const status = await sub.status;
        t.diagnostic(`${label}: ${status.value}${status.error ? ` (${status.error})` : ""}`);
      }
      const forgedArrived = [...witness.received, ...ownChat.received].filter((e) => e.payload?.unread_count === 99 || (e.event === "state" && e.payload?.state === "done"));
      assert.equal(forgedArrived.length, 0, `forged events delivered (private send result: ${sendResult})`);
      assert.ok(!witness.received.some((e) => e.payload?.order_number === B), "nothing about B reaches A");
      for (const sub of [peek, peekChat, anonPeek, adminPeek]) assert.equal(sub.received.length, 0);

      const everything = JSON.stringify([...witness.received, ...ownChat.received]);
      assert.doesNotMatch(everything, /order-chat-attachments|\.jpg|\.webp|\.png|storage_path|thumb_path/);
      assert.doesNotMatch(everything, new RegExp(`${ids.robert}|${ids.andre}|${ids.kenneth}|sender_user_id|done_by|assigned`));
    } finally {
      for (const client of [custd, custaSecond, custe, anon, robert]) await client.removeAllChannels();
    }
  });
});

describe("file validation over HTTP", () => {
  const cid = crypto.randomUUID();
  const send = (file, thumb = THUMB) => upload("custe", B, cid, 0, file, thumb);

  test("refused: > 4 MB, fake PNG, unsupported type, renamed executable, malformed image, bad thumbnail", async () => {
    const big = Buffer.alloc(4 * 1024 * 1024 + 10);
    Buffer.from(fixtures.photoJpeg, "base64").copy(big);
    const fakePng = Buffer.alloc(2048);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(fakePng);
    const exe = Buffer.alloc(2048);
    Buffer.from("MZ\x90\x00", "latin1").copy(exe);
    const truncated = Buffer.from(fixtures.png, "base64").subarray(0, 40);
    const cases = [
      ["> 4 MB", { b64: big.toString("base64"), mime: "image/jpeg" }, THUMB, /^(400|413)$/, /4 MB max/],
      ["fake PNG", { b64: fakePng.toString("base64"), mime: "image/png" }, THUMB, 400],
      ["GIF", { b64: Buffer.from("GIF89a\x01\x00\x01\x00", "latin1").toString("base64"), mime: "image/gif" }, THUMB, 400],
      ["SVG", { b64: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64"), mime: "image/svg+xml" }, THUMB, 400],
      ["exe renamed to .jpg", { b64: exe.toString("base64"), mime: "image/jpeg", name: "photo.jpg" }, THUMB, 400],
      ["malformed PNG", { b64: truncated.toString("base64"), mime: "image/png" }, THUMB, 400],
      ["JPEG declared as PNG", { b64: fixtures.photoJpeg, mime: "image/png" }, THUMB, 400],
      ["fake thumbnail", IMAGE, { b64: exe.toString("base64"), mime: "image/webp" }, 400],
    ];
    for (const [label, file, thumb, status, message] of cases) {
      const result = await send(file, thumb);
      if (status instanceof RegExp) assert.match(String(result.status), status, `${label}: ${result.text}`);
      else assert.equal(result.status, status, `${label}: ${result.text}`);
      if (message) assert.match(result.text, message);
    }
    assert.equal((await objectsIn(folderOf(B, "custe", cid))).length, 0, "nothing was stored");
  });

  test("accepted: JPG, PNG and WebP", async () => {
    const formats = [
      { b64: fixtures.photoJpeg, mime: "image/jpeg" },
      { b64: fixtures.png, mime: "image/png" },
      { b64: fixtures.photoWebp, mime: "image/webp" },
    ];
    const album = crypto.randomUUID();
    for (const [position, file] of formats.entries()) {
      const result = await upload("custe", B, album, position, file);
      assert.equal(result.status, 201, result.text);
    }
    assert.equal((await postAlbum("custe", B, album, 3)).status, 201);
    const names = (await objectsIn(folderOf(B, "custe", album))).map((o) => o.name.split("/").pop());
    assert.deepEqual(names.sort(), ["0.jpg", "0.thumb.webp", "1.png", "1.thumb.webp", "2.thumb.webp", "2.webp"]);
  });
});

describe("composer and viewer in the browser", () => {
  const file = (i) => ({ name: `photo-${i + 1}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(fixtures.photoJpeg, "base64") });
  const newestAlbum = async () =>
    (await sql(
      `select m.id, m.client_message_id, (select count(*)::int from store_order_message_attachments x where x.message_id = m.id) as n
         from store_order_messages m where m.order_number = $1 and m.kind = 'album' and m.sender_user_id = $2
        order by m.created_at desc limit 1`,
      [B, ids.custe],
    ))[0];

  test("10 picked, 3 removed before sending: one album of 7, only 7 images (+7 thumbnails) ever uploaded", async () => {
    const page = people.custe.page;
    await page.goto(`/orders/${B}`);
    const uploads = [];
    page.on("request", (request) => request.method() === "POST" && request.url().includes("/uploads?") && uploads.push(request.url()));
    await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 10 }, (_, i) => file(i)));
    await page.getByText("10 images selected").waitFor();
    for (let i = 0; i < 3; i += 1) await page.getByRole("button", { name: "Remove image 1", exact: true }).click();
    const target = await page.getByRole("button", { name: "Remove image 1", exact: true }).evaluate((node) => {
      const after = getComputedStyle(node, "::after");
      return node.getBoundingClientRect().width - 2 * parseFloat(after.left);
    });
    assert.ok(target >= 40, `remove tap target ${target}px`);
    await page.getByText("7 images selected").waitFor();
    await page.getByRole("button", { name: "Send message" }).click();
    await page.locator('[data-album-count="7"]').last().waitFor({ timeout: 60_000 });
    const album = await newestAlbum();
    assert.equal(album.n, 7);
    assert.equal(uploads.length, 7, "removed images were never sent");
    assert.equal((await objectsIn(folderOf(B, "custe", album.client_message_id))).length, 14);
  });

  test("Cancel while uploading: uploads stop, stored files are deleted, nothing is posted", async () => {
    const page = people.custe.page;
    await page.goto(`/orders/${B}`);
    const before = await newestAlbum();
    await page.route("**/uploads?**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await settle(1200);
      await route.continue().catch(() => undefined); // aborted by Cancel meanwhile
    });
    await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 10 }, (_, i) => file(i)));
    await page.getByText("10 images selected").waitFor();
    await page.getByRole("button", { name: "Send message" }).click();
    const pending = page.locator("[data-pending-id]").last();
    const cid = await pending.getAttribute("data-pending-id");
    await page.getByText(/Uploading [3-5] of 10/).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Cancel sending these photos" }).click();
    await pending.waitFor({ state: "detached" });
    await settle(4000);
    await page.unroute("**/uploads?**");
    assert.equal((await newestAlbum()).id, before.id, "no album was posted");
    assert.equal((await objectsIn(folderOf(B, "custe", cid))).length, 0, "files that reached the server were deleted");
  });

  test("a 10-image album: metadata only, 4 thumbnails in the chat, originals only in the viewer", async (t) => {
    const page = people.custe.page;
    await page.goto("about:blank"); // measure one fresh page load only
    const ten = await sendAlbum("kenneth", B, 10);
    const media = [];
    const objects = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/order-chat/media/")) media.push(url); // album images (fonts live under /_next/static/media)
      if (url.includes("/storage/v1/object/sign/")) objects.push(url);
    });
    const thread = await people.custe.context.request.get(`/api/order-chat/${B}/messages?as=customer`);
    const message = (await thread.json()).messages.find((m) => m.id === ten.message.id);
    const bytes = Buffer.byteLength(JSON.stringify(message));
    t.diagnostic(`album message JSON: ${bytes} bytes for 10 images`);
    assert.ok(bytes < 2000, `${bytes} bytes`);

    await page.goto(`/orders/${B}`);
    const album = page.locator('[data-album-count="10"]').last();
    await album.waitFor();
    await album.scrollIntoViewIfNeeded();
    await settle(2000);
    const ids10 = ten.message.album.items.map((item) => item.id);
    const thumbs = media.filter((url) => url.includes("size=thumb") && ids10.some((id) => url.includes(id)));
    t.diagnostic(`chat: ${thumbs.length} thumbnail requests for the 10-image album, ${media.filter((u) => u.includes("size=full")).length} full, ${objects.filter((u) => /\.thumb\./.test(u)).length} thumbnail files fetched`);
    assert.equal(media.filter((url) => url.includes("size=full")).length, 0, "no original in the chat");
    assert.equal(thumbs.length, 4, "the 10-image album loads its 4 visible tiles only");
    assert.equal(objects.filter((url) => !/\.thumb\./.test(url)).length, 0, "no original file fetched");

    media.length = 0;
    await album.getByRole("button", { name: "View photo 1" }).click();
    await page.getByRole("dialog").getByText("1 / 10").waitFor();
    await settle(1500);
    const full = media.filter((url) => url.includes("size=full"));
    t.diagnostic(`viewer open: ${full.length} originals requested (current + next)`);
    assert.ok(full.length >= 1 && full.length <= 2, `${full.length}`);
    await page.keyboard.press("Escape");
  });
});

describe("rate limits", () => {
  test("a 10-image album works; 40 uploads a minute per person is the ceiling", async () => {
    const order = { order_number: C2 };
    const ten = await sendAlbum("custf", order.order_number, 10);
    assert.equal(ten.message.album.items.length, 10);
    const statuses = [];
    const burst = crypto.randomUUID();
    for (let i = 0; i < 40; i += 1) statuses.push((await upload("custf", order.order_number, burst, i % 10)).status);
    statuses.push(...(await Promise.all(Array.from({ length: 10 }, (_, i) => upload("custf", order.order_number, burst, i)))).map((r) => r.status));
    assert.ok(statuses.includes(429), `burst statuses: ${[...new Set(statuses)].join(",")}`);
    const firstLimited = statuses.indexOf(429);
    assert.ok(firstLimited >= 29, `limited only after the 40-a-minute budget (first 429 at upload ${firstLimited + 11})`);
  });
});
