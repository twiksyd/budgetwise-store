import { isUuid } from "@/lib/order-chat.mjs";
import { isReactionKey, reactionsFromEvent } from "@/lib/chat/message-meta.mjs";
import { createRateLimiter } from "@/lib/chat/rate-limit.mjs";
import { getMessageInOrder, resolveChatActor, setReaction } from "@/lib/queries/order-chat";
import { chatError, chatJson, isSameOriginRequest, parseActingAs, readSmallJson, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// Per server instance; a person tapping reactions never comes close.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

// POST ?as=customer|admin {messageId, reaction: "love"|"haha"|"sad"|"wow"|"like"|null}
// One reaction per person per message; null removes mine. The actor comes
// from the session; the database re-checks owner/admin and that the message
// is in this conversation. Reactions never mark anything read or replied.
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);
  const body = (await readSmallJson(request, 512)) as { messageId?: unknown; reaction?: unknown } | null;
  if (!isUuid(body?.messageId) || !(body.reaction === null || isReactionKey(body.reaction))) {
    return chatError("Invalid request.", 400);
  }
  if (!limiter.take(actor.userId).ok) return chatError("Too many reactions. Please wait a moment.", 429);
  try {
    const message = await getMessageInOrder(orderNumber, body.messageId);
    if (!message) return chatError("Not found.", 404);
    const summary = await setReaction({
      orderNumber: message.order_number,
      messageId: body.messageId,
      actorId: actor.userId,
      role: actor.role,
      reaction: body.reaction,
    });
    const reactions = reactionsFromEvent(
      { counts: summary.counts, customer: summary.customer, admins: summary.admins },
      { viewer: actor.role, me: actor.userId },
    );
    return chatJson({ messageId: body.messageId, reactions });
  } catch (error) {
    return routeErrorResponse(error, "Set reaction");
  }
}
