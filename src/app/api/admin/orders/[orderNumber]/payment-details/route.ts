import { isInquiryKey, isUuid, isValidOrderNumber } from "@/lib/order-chat.mjs";
import { toChatMessage } from "@/lib/chat/dto.mjs";
import { sendPaymentDetails } from "@/lib/queries/order-chat";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// POST {methodId, clientMessageId}. The amount and account details are read
// by the database from the order total and the stored payment account; the
// request cannot supply either.
export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) return chatError("Not found.", 404);
  // A General Inquiry has no order total to pay (the database refuses too).
  if (isInquiryKey(orderNumber)) return chatError("Payment details are for orders only.", 409);
  const body = (await readSmallJson(request)) as { methodId?: unknown; clientMessageId?: unknown } | null;
  if (!isUuid(body?.methodId) || !isUuid(body?.clientMessageId)) return chatError("Invalid request.", 400);
  try {
    const message = await sendPaymentDetails({
      orderNumber,
      actorId: gate.adminId,
      methodId: body.methodId,
      clientMessageId: body.clientMessageId,
    });
    return chatJson({ message: toChatMessage(message, { viewer: "admin" }) }, 201);
  } catch (error) {
    return routeErrorResponse(error, "Send payment details");
  }
}
