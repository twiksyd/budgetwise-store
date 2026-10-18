import { isUuid, isValidOrderNumber } from "@/lib/order-chat.mjs";
import { isRecommendationType } from "@/lib/chat/recommendation.mjs";
import { getMessageById, toChatDataError, toChatMessages, ChatDataError } from "@/lib/queries/order-chat";
import { CustomerThreadError, sendRecommendation } from "@/lib/queries/customer-thread";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// POST {type: "game"|"product", gameId, gamepassId?, clientMessageId}:
// send a game pricelist or one product as a card in this chat (0033).
// The request only names catalog ids; the card is built from the live
// catalog on the server, and the database re-checks the admin, the card's
// shape (ids + display text, never a URL) and idempotency.
export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) return chatError("Not found.", 404);
  const body = (await readSmallJson(request)) as
    | { type?: unknown; gameId?: unknown; gamepassId?: unknown; clientMessageId?: unknown }
    | null;
  if (!isRecommendationType(body?.type) || !isUuid(body?.gameId) || !isUuid(body?.clientMessageId)) {
    return chatError("Invalid request.", 400);
  }
  if (body.type === "product" ? !isUuid(body.gamepassId) : body.gamepassId !== undefined && body.gamepassId !== null) {
    return chatError("Invalid request.", 400);
  }
  try {
    const messageId = await sendRecommendation({
      key: orderNumber,
      actorId: gate.adminId,
      type: body.type,
      gameId: body.gameId,
      gamepassId: body.type === "product" ? (body.gamepassId as string) : null,
      clientMessageId: body.clientMessageId,
    }).catch((error: unknown) => {
      if (error instanceof CustomerThreadError) throw new ChatDataError(error.message, error.code === "not_found" ? 404 : 400);
      if (error && typeof error === "object" && "code" in error) throw toChatDataError(error as { code?: string });
      throw error;
    });
    const row = await getMessageById(messageId);
    if (!row) return chatError("Not found.", 404);
    const [message] = await toChatMessages([row], { viewer: "admin", viewerUserId: gate.adminId });
    return chatJson({ message }, 201);
  } catch (error) {
    return routeErrorResponse(error, "Send product card");
  }
}
