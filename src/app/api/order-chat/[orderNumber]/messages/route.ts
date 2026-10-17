import {
  MAX_ATTACHMENT_BYTES,
  isUuid,
  sniffImageType,
  validateAttachmentMeta,
  validateMessageBody,
} from "@/lib/order-chat.mjs";
import { toChatMessage } from "@/lib/chat/dto.mjs";
import {
  MESSAGE_PAGE_SIZE,
  attachmentPathFor,
  isOverMessageRateLimit,
  listMessages,
  listMessagesSinceTimestamp,
  postMessage,
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
 */
export async function GET(request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);

  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const viewer = { viewer: actor.role, viewerUserId: actor.userId } as const;

  try {
    if (after && !isUuid(after)) {
      if (Number.isNaN(Date.parse(after))) return chatError("Invalid cursor.", 400);
      const rows = await listMessagesSinceTimestamp(orderNumber, after);
      return chatJson({ messages: rows.map((row) => toChatMessage(row, viewer)) });
    }
    if (before && !isUuid(before)) return chatError("Invalid cursor.", 400);

    const rows = await listMessages(orderNumber, {
      before,
      after,
      limit: MESSAGE_PAGE_SIZE,
    });
    return chatJson({
      messages: rows.map((row) => toChatMessage(row, viewer)),
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
 */
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);

  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return chatError("That image is too large (4 MB max).", 413);
  }

  const contentType = request.headers.get("content-type") ?? "";
  let rawBody: unknown;
  let rawClientId: unknown = null;
  let file: File | null = null;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      rawBody = form.get("body") ?? "";
      rawClientId = form.get("clientMessageId");
      const maybeFile = form.get("file");
      if (maybeFile instanceof File && maybeFile.size > 0) file = maybeFile;
    } else if (contentType.startsWith("application/json")) {
      const json = (await request.json()) as { body?: unknown; clientMessageId?: unknown } | null;
      rawBody = json?.body;
      rawClientId = json?.clientMessageId ?? null;
    } else {
      return chatError("Unsupported request.", 415);
    }
  } catch {
    return chatError("That message could not be read.", 400);
  }

  // Older open tabs send no id; new clients always do.
  if (rawClientId !== null && rawClientId !== "" && !isUuid(rawClientId)) {
    return chatError("Invalid request.", 400);
  }
  const clientMessageId = isUuid(rawClientId) ? rawClientId : null;

  const body = validateMessageBody(rawBody, { allowEmpty: file !== null });
  if (!body.ok) return chatError(body.error, 400);

  try {
    if (await isOverMessageRateLimit(orderNumber, actor.userId)) {
      return chatError("Sending too fast. Please wait a moment.", 429);
    }

    const viewer = { viewer: actor.role, viewerUserId: actor.userId } as const;

    if (!file) {
      const result = await postMessage({
        orderNumber,
        role: actor.role,
        userId: actor.userId,
        kind: "text",
        body: body.body,
        clientMessageId,
      });
      return chatJson(
        { message: toChatMessage(result.message, viewer) },
        result.created ? 201 : 200,
      );
    }

    const meta = validateAttachmentMeta({ type: file.type, size: file.size });
    if (!meta.ok) return chatError(meta.error, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return chatError("That image is too large (4 MB max).", 413);
    }
    // The declared type is a hint; the bytes decide.
    const sniffed = sniffImageType(bytes);
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
    return chatJson(
      { message: toChatMessage(result.message, viewer) },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return routeErrorResponse(error, "Send chat message");
  }
}
