import { siteConfig } from "@/config/site";
import {
  inspectImage,
  isUuid,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentMeta,
} from "@/lib/order-chat.mjs";
import { parseUploadFields, THUMB_MAX_BYTES } from "@/lib/chat/album.mjs";
import { createRateLimiter } from "@/lib/chat/rate-limit.mjs";
import {
  albumFolderFor,
  deletePendingAlbumUploads,
  messageExistsForClientId,
  resolveChatActor,
  uploadAttachment,
} from "@/lib/queries/order-chat";
import {
  chatError,
  chatJson,
  isSameOriginRequest,
  parseActingAs,
  routeErrorResponse,
} from "@/lib/order-chat-http";

// One image (<= 4 MB) + its thumbnail (<= 256 KB) + form framing: under
// Vercel's 4.5 MB request limit.
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + THUMB_MAX_BYTES + 64 * 1024;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Per server instance and user: an album is at most 10 uploads; this only
// stops a runaway client from filling storage.
const limiter = createRateLimiter({ limit: 40, windowMs: 60_000 });

type Context = { params: Promise<{ orderNumber: string }> };

/**
 * POST ?as=customer|admin  multipart: file, thumb, position (0-9), clientMessageId
 * Stores one album image and its thumbnail at the sender's deterministic
 * paths. Files are write-once: a retry finds them already stored (never a
 * duplicate), and nothing can be uploaded into an album that was already
 * posted. The album message itself is created by POST /messages
 * {kind: "album"} once every image is up.
 */
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);

  // Customers' on-site chats are history only while orders continue on
  // Messenger (siteConfig.orderHandoff.onSiteChatReadOnly). Admins can reply.
  if (actor.role === "customer" && siteConfig.orderHandoff.onSiteChatReadOnly) {
    return chatError("This chat is now read-only. Please message us on Messenger at BudgetWise DGM.", 403);
  }

  if (!limiter.take(actor.userId).ok) return chatError("Uploading too fast. Please wait a moment.", 429);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return chatError("That image is too large (4 MB max).", 413);
  }
  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return chatError("Unsupported request.", 415);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return chatError("That upload could not be read.", 400);
  }
  const fields = parseUploadFields({
    position: form.get("position"),
    clientMessageId: form.get("clientMessageId"),
  });
  if (!fields.ok) return chatError(fields.error, 400);

  const file = form.get("file");
  const thumb = form.get("thumb");
  if (!(file instanceof File) || file.size === 0 || !(thumb instanceof File) || thumb.size === 0) {
    return chatError("Choose an image to send.", 400);
  }

  const meta = validateAttachmentMeta({ type: file.type, size: file.size });
  if (!meta.ok) return chatError(meta.error, 400);
  if (thumb.size > THUMB_MAX_BYTES) return chatError("That preview is too large.", 400);

  try {
    const [bytes, thumbBytes] = await Promise.all([
      file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      thumb.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    ]);
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return chatError("That image is too large (4 MB max).", 413);
    // The declared types are hints; the bytes (and their structure) decide.
    const image = inspectImage(bytes);
    if (!image || image.type !== file.type) {
      return chatError("Only JPG, PNG, or WebP images can be sent.", 400);
    }
    const sniffed = image.type;
    const thumbType = inspectImage(thumbBytes)?.type;
    if (!thumbType) return chatError("Only JPG, PNG, or WebP images can be sent.", 400);

    if (await messageExistsForClientId(orderNumber, actor.userId, fields.clientMessageId)) {
      return chatError("These photos were already sent.", 409);
    }
    const folder = albumFolderFor({ orderNumber, userId: actor.userId, clientMessageId: fields.clientMessageId });
    await Promise.all([
      uploadAttachment(`${folder}${fields.position}.${EXTENSIONS[sniffed]}`, bytes, sniffed),
      uploadAttachment(`${folder}${fields.position}.thumb.${EXTENSIONS[thumbType]}`, thumbBytes, thumbType),
    ]);
    return chatJson({ position: fields.position }, 201);
  } catch (error) {
    return routeErrorResponse(error, "Upload album image");
  }
}

/**
 * DELETE ?as=customer|admin&clientMessageId=<uuid>
 * Cancel / discard: removes the sender's OWN uploads for an album that was
 * never posted (other people's folders and posted albums are untouchable).
 * Best-effort from the browser; the scheduled cleanup catches the rest.
 */
export async function DELETE(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);
  const clientMessageId = new URL(request.url).searchParams.get("clientMessageId");
  if (!isUuid(clientMessageId)) return chatError("Invalid request.", 400);
  try {
    const result = await deletePendingAlbumUploads(orderNumber, actor.userId, clientMessageId);
    return chatJson(result, result.posted ? 409 : 200);
  } catch (error) {
    return routeErrorResponse(error, "Cancel album upload");
  }
}
