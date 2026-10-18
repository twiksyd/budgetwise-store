import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import { getMessageById, sendVouchRequest, toChatMessages } from "@/lib/queries/order-chat";
import { chatError, chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

/** POST: send the conversation's single structured Vouch Request card. */
export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) return chatError("Not found.", 404);

  try {
    const result = await sendVouchRequest({ orderNumber, actorId: gate.adminId });
    const row = await getMessageById(result.messageId);
    if (!row || row.order_number !== orderNumber) return chatError("Not found.", 404);
    const [message] = await toChatMessages([row], { viewer: "admin", viewerUserId: gate.adminId });
    return chatJson({ created: result.created, message }, result.created ? 201 : 200);
  } catch (error) {
    return routeErrorResponse(error, "Send vouch request");
  }
}
