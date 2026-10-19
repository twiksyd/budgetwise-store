import { isUuid, isValidOrderNumber } from "@/lib/order-chat.mjs";
import { confirmPaymentReceived, getMessageInOrder, toChatMessages } from "@/lib/queries/order-chat";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// POST {messageId}: "Payment Received" for that payment card (0027).
// The admin is the verified session's admin (never a request field); the
// database re-checks it, that the card is this order's latest one, and
// makes repeats return the first confirmation (200 instead of 201).
// BudgetWise-internal: XOB orders.status is not touched. Order chats and,
// since 0031, General Inquiry quotes.
export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) return chatError("Not found.", 404);
  const body = (await readSmallJson(request)) as { messageId?: unknown } | null;
  if (!isUuid(body?.messageId)) return chatError("Invalid request.", 400);
  try {
    const original = await getMessageInOrder(orderNumber, body.messageId);
    if (!original) return chatError("Not found.", 404);
    const result = await confirmPaymentReceived({ orderNumber: original.order_number, messageId: body.messageId, actorId: gate.adminId });
    const row = await getMessageInOrder(orderNumber, body.messageId);
    if (!row) return chatError("Not found.", 404);
    const [message] = await toChatMessages([row], { viewer: "admin", viewerUserId: gate.adminId, conversationKey: orderNumber });
    return chatJson({ created: result.created, message }, result.created ? 201 : 200);
  } catch (error) {
    return routeErrorResponse(error, "Confirm payment");
  }
}
