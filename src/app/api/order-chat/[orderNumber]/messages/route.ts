import { NextResponse } from "next/server";
import {
  MAX_ATTACHMENT_BYTES,
  sniffImageType,
  validateAttachmentMeta,
  validateMessageBody,
} from "@/lib/order-chat.mjs";
import {
  insertImageMessage,
  insertTextMessage,
  isOverMessageRateLimit,
  listChatMessages,
  resolveChatActor,
} from "@/lib/queries/order-chat";
import {
  chatError,
  isSameOriginRequest,
  parseActingAs,
} from "@/lib/order-chat-http";
import { toChatMessage } from "@/types/order-chat";

// Image bytes plus multipart framing and a short caption.
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;

type Context = { params: Promise<{ orderNumber: string }> };

export async function GET(request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);

  const after = new URL(request.url).searchParams.get("after");
  if (after && Number.isNaN(Date.parse(after))) {
    return chatError("Invalid cursor.", 400);
  }

  const rows = await listChatMessages(orderNumber, { after });
  return NextResponse.json(
    { messages: rows.map(toChatMessage) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

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
  let file: File | null = null;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      rawBody = form.get("body") ?? "";
      const maybeFile = form.get("file");
      if (maybeFile instanceof File && maybeFile.size > 0) file = maybeFile;
    } else if (contentType.startsWith("application/json")) {
      const json = (await request.json()) as { body?: unknown } | null;
      rawBody = json?.body;
    } else {
      return chatError("Unsupported request.", 415);
    }
  } catch {
    return chatError("That message could not be read.", 400);
  }

  const body = validateMessageBody(rawBody, { allowEmpty: file !== null });
  if (!body.ok) return chatError(body.error, 400);

  if (await isOverMessageRateLimit(orderNumber, actor.role)) {
    return chatError("Sending too fast. Please wait a moment.", 429);
  }

  try {
    if (!file) {
      const row = await insertTextMessage(actor, body.body);
      return NextResponse.json(
        { message: toChatMessage(row) },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }

    const meta = validateAttachmentMeta({ type: file.type, size: file.size });
    if (!meta.ok) return chatError(meta.error, 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    // The declared type is a hint; the bytes decide. A renamed HTML/SVG file
    // never reaches storage as an "image".
    const sniffed = sniffImageType(bytes);
    if (!sniffed || sniffed !== file.type) {
      return chatError("Only JPG, PNG, or WebP images can be sent.", 400);
    }

    const row = await insertImageMessage(actor, {
      body: body.body,
      bytes,
      mime: sniffed,
      extension: meta.extension,
    });
    return NextResponse.json(
      { message: toChatMessage(row) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to send chat message", {
      orderNumber,
      error: error instanceof Error ? error.message : error,
    });
    return chatError("Couldn't send that. Please try again.", 500);
  }
}
