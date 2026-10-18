import { isInquiryKey, isUuid, isValidOrderNumber } from "@/lib/order-chat.mjs";
import { toChatMessage } from "@/lib/chat/dto.mjs";
import { parseQuoteAmount } from "@/lib/chat/payment-quote.mjs";
import { sendInquiryPaymentDetails, sendPaymentDetails } from "@/lib/queries/order-chat";
import { getOrderHomeKey } from "@/lib/queries/customer-thread";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// POST {methodId, clientMessageId} for an order: the amount and account
// details are read by the database from the order total and the stored
// payment account; the request cannot supply either.
// POST {methodId, clientMessageId, amount} for a General Inquiry (0031):
// there is no order total, so the admin's explicit quote is required (and
// validated again by the database). No order is created.
// POST {methodId, clientMessageId, orderRef} in a customer conversation
// (0033): that order's card, posted in the conversation and tagged with the
// order (amount = that order's total). The order must belong to this
// conversation; the database checks it again.
export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) return chatError("Not found.", 404);
  const body = (await readSmallJson(request)) as
    | { methodId?: unknown; clientMessageId?: unknown; amount?: unknown; orderRef?: unknown }
    | null;
  if (!isUuid(body?.methodId) || !isUuid(body?.clientMessageId)) return chatError("Invalid request.", 400);
  try {
    if (isInquiryKey(orderNumber) && body.orderRef !== undefined && body.orderRef !== null) {
      const orderRef = body.orderRef;
      if (typeof orderRef !== "string" || !isValidOrderNumber(orderRef) || isInquiryKey(orderRef)) {
        return chatError("Invalid order.", 400);
      }
      if (body.amount !== undefined) return chatError("Order payment details always use the order total.", 400);
      if ((await getOrderHomeKey(orderRef)) !== orderNumber) return chatError("That order is not part of this conversation.", 409);
      const message = await sendPaymentDetails({
        orderNumber: orderRef,
        actorId: gate.adminId,
        methodId: body.methodId,
        clientMessageId: body.clientMessageId,
      });
      return chatJson({ message: toChatMessage(message, { viewer: "admin" }) }, 201);
    }
    if (isInquiryKey(orderNumber)) {
      const amount = parseQuoteAmount(body.amount);
      if (amount === null) return chatError("Enter an amount from ₱0.01 to ₱1,000,000.", 400);
      const message = await sendInquiryPaymentDetails({
        key: orderNumber,
        actorId: gate.adminId,
        methodId: body.methodId,
        amount,
        clientMessageId: body.clientMessageId,
      });
      return chatJson({ message: toChatMessage(message, { viewer: "admin" }) }, 201);
    }
    // Orders: unchanged — the order total is the amount, never the request's.
    if (body.amount !== undefined) return chatError("Order payment details always use the order total.", 400);
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
