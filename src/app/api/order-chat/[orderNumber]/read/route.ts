import { isUuid } from "@/lib/order-chat.mjs";
import {
  listMessages,
  markAdminRead,
  markCustomerRead,
  resolveChatActor,
} from "@/lib/queries/order-chat";
import {
  chatError,
  chatJson,
  isSameOriginRequest,
  parseActingAs,
  readSmallJson,
  routeErrorResponse,
} from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

/**
 * POST ?as=customer|admin  {messageId}
 * Moves the caller's read position up to a message they were shown. For an
 * admin it is THEIR OWN position only. Tabs from the previous build send no
 * body; they are treated as "read up to the newest message".
 */
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);

  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);

  const body = (await readSmallJson(request)) as { messageId?: unknown } | null;

  try {
    let messageId = body?.messageId;
    if (messageId === undefined || messageId === null) {
      const newest = await listMessages(orderNumber, { limit: 1 });
      messageId = newest[newest.length - 1]?.id;
      if (!messageId) return chatJson({ ok: true });
    }
    if (!isUuid(messageId)) return chatError("Invalid request.", 400);

    const cursor =
      actor.role === "admin"
        ? await markAdminRead(orderNumber, actor.userId, messageId)
        : await markCustomerRead(orderNumber, messageId);
    return chatJson({ ok: true, cursor });
  } catch (error) {
    return routeErrorResponse(error, "Mark chat read");
  }
}
