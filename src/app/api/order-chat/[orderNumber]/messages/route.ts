import { siteConfig } from "@/config/site";
import {
  MAX_ATTACHMENT_BYTES,
  isUuid,
  inspectImage,
  validateAttachmentMeta,
  validateMessageBody,
} from "@/lib/order-chat.mjs";
import { buildAlbumAttachments, parseAlbumRequest } from "@/lib/chat/album.mjs";
import {
  MESSAGE_PAGE_SIZE,
  albumFolderFor,
  attachmentPathFor,
  getMessageInOrder,
  isOverMessageRateLimit,
  listAlbumUploads,
  listMessages,
  listMessagesSinceTimestamp,
  postAlbum,
  postMessage,
  resolveChatActor,
  toChatMessages,
  uploadAttachment,
} from "@/lib/queries/order-chat";
import {
  chatError,
  chatJson,
  isSameOriginRequest,
  parseActingAs,
  routeErrorResponse,
} from "@/lib/order-chat-http";

// Image bytes plus multipart framing and a caption. Stays under Vercel's
// 4.5 MB request body limit.
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;

type Context = { params: Promise<{ orderNumber: string }> };

/**
 * GET ?as=customer|admin
 *   (no cursor)        newest page, oldest-first
 *   &before=<msgId>    the page before that message
 *   &after=<msgId>     everything newer (delta fetch after a realtime ping)
 *   &after=<ISO time>  previous build's polling (tabs open across a deploy)
 *   &message=<msgId>   just that message, re-read (payment confirmed, 0027)
 */
export async function GET(request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);

  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const single = url.searchParams.get("message");
  const viewer = { viewer: actor.role, viewerUserId: actor.userId, conversationKey: orderNumber } as const;

  try {
    if (single !== null) {
      if (!isUuid(single)) return chatError("Invalid message.", 400);
      // Scoped to this conversation: another order's message is "not found".
      const row = await getMessageInOrder(orderNumber, single);
      return chatJson({ messages: row ? await toChatMessages([row], viewer) : [] });
    }
    if (after && !isUuid(after)) {
      if (Number.isNaN(Date.parse(after))) return chatError("Invalid cursor.", 400);
      const rows = await listMessagesSinceTimestamp(orderNumber, after);
      return chatJson({ messages: await toChatMessages(rows, viewer) });
    }
    if (before && !isUuid(before)) return chatError("Invalid cursor.", 400);

    const rows = await listMessages(orderNumber, {
      before,
      after,
      limit: MESSAGE_PAGE_SIZE,
    });
    return chatJson({
      messages: await toChatMessages(rows, viewer),
      // Newest/older pages: a full page means there may be more before it.
      hasOlder: after ? undefined : rows.length === MESSAGE_PAGE_SIZE,
    });
  } catch (error) {
    return routeErrorResponse(error, "List chat messages");
  }
}

/**
 * POST ?as=customer|admin — JSON {body, clientMessageId} or multipart
 * (body, file, clientMessageId). A retry with the same clientMessageId
 * returns the original message (200) instead of creating another (201).
 *
 * Albums (JSON {kind: "album", clientMessageId, body, label?, items}):
 * the images were uploaded first, one per request, through
 * /api/order-chat/<order>/uploads; this turns them into ONE message.
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

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return chatError("That image is too large (4 MB max).", 413);
  }

  const contentType = request.headers.get("content-type") ?? "";
  let rawBody: unknown;
  let rawClientId: unknown = null;
  let file: File | null = null;
  let albumRequest: unknown = null;
  // 0032: a text reply names the message it answers (checked by the database
  // to be in this same conversation).
  let rawReplyTo: unknown = null;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      rawBody = form.get("body") ?? "";
      rawClientId = form.get("clientMessageId");
      const maybeFile = form.get("file");
      if (maybeFile instanceof File && maybeFile.size > 0) file = maybeFile;
    } else if (contentType.startsWith("application/json")) {
      const json = (await request.json()) as
        | { kind?: unknown; body?: unknown; clientMessageId?: unknown; replyToMessageId?: unknown }
        | null;
      if (json?.kind === "album") albumRequest = json;
      rawBody = json?.body;
      rawClientId = json?.clientMessageId ?? null;
      rawReplyTo = json?.replyToMessageId ?? null;
    } else {
      return chatError("Unsupported request.", 415);
    }
  } catch {
    return chatError("That message could not be read.", 400);
  }

  if (albumRequest) return sendAlbum(orderNumber, actor, albumRequest);

  // Older open tabs send no id; new clients always do.
  if (rawClientId !== null && rawClientId !== "" && !isUuid(rawClientId)) {
    return chatError("Invalid request.", 400);
  }
  const clientMessageId = isUuid(rawClientId) ? rawClientId : null;
  if (rawReplyTo !== null && !isUuid(rawReplyTo)) return chatError("Invalid request.", 400);
  const replyTo = isUuid(rawReplyTo) ? rawReplyTo : null;

  const body = validateMessageBody(rawBody, { allowEmpty: file !== null });
  if (!body.ok) return chatError(body.error, 400);

  try {
    if (await isOverMessageRateLimit(orderNumber, actor.userId)) {
      return chatError("Sending too fast. Please wait a moment.", 429);
    }

    const viewer = { viewer: actor.role, viewerUserId: actor.userId, conversationKey: orderNumber } as const;

    if (!file) {
      const result = await postMessage({
        orderNumber,
        role: actor.role,
        userId: actor.userId,
        kind: "text",
        body: body.body,
        clientMessageId,
        replyTo,
      });
      const [message] = await toChatMessages([result.message], viewer);
      return chatJson({ message }, result.created ? 201 : 200);
    }

    const meta = validateAttachmentMeta({ type: file.type, size: file.size });
    if (!meta.ok) return chatError(meta.error, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return chatError("That image is too large (4 MB max).", 413);
    }
    // The declared type is a hint; the bytes (and their structure) decide.
    const sniffed = inspectImage(bytes)?.type ?? null;
    if (!sniffed || sniffed !== file.type) {
      return chatError("Only JPG, PNG, or WebP images can be sent.", 400);
    }

    const path = attachmentPathFor({
      orderNumber,
      userId: actor.userId,
      clientMessageId: clientMessageId ?? crypto.randomUUID(),
      extension: meta.extension,
    });
    await uploadAttachment(path, bytes, sniffed);

    const result = await postMessage({
      orderNumber,
      role: actor.role,
      userId: actor.userId,
      kind: "image",
      body: body.body,
      attachmentPath: path,
      attachmentMime: sniffed,
      clientMessageId,
    });
    const [message] = await toChatMessages([result.message], viewer);
    return chatJson({ message }, result.created ? 201 : 200);
  } catch (error) {
    return routeErrorResponse(error, "Send chat message");
  }
}

async function sendAlbum(
  orderNumber: string,
  actor: { role: "admin" | "customer"; userId: string },
  input: unknown,
) {
  const parsed = parseAlbumRequest(input, { role: actor.role });
  if (!parsed.ok) return chatError(parsed.error, parsed.status ?? 400);
  try {
    if (await isOverMessageRateLimit(orderNumber, actor.userId)) {
      return chatError("Sending too fast. Please wait a moment.", 429);
    }
    const folder = albumFolderFor({ orderNumber, userId: actor.userId, clientMessageId: parsed.clientMessageId });
    const built = buildAlbumAttachments(parsed.items, await listAlbumUploads(folder));
    if (!built.ok) return chatJson({ error: built.error, missing: built.missing }, 409);

    const result = await postAlbum({
      orderNumber,
      role: actor.role,
      userId: actor.userId,
      body: parsed.body,
      label: parsed.label,
      attachments: built.attachments,
      clientMessageId: parsed.clientMessageId,
    });
    const [message] = await toChatMessages([result.message], { viewer: actor.role, viewerUserId: actor.userId });
    return chatJson({ message }, result.created ? 201 : 200);
  } catch (error) {
    return routeErrorResponse(error, "Send album");
  }
}
