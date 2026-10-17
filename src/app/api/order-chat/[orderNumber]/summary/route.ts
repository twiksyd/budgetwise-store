import {
  getConversation,
  lastAdminSenderId,
  loadCustomerFulfillment,
  loadCustomerOrderSummary,
  loadPublicAdminNames,
  resolveChatActor,
} from "@/lib/queries/order-chat";
import { pickAssistant } from "@/lib/chat/assistant.mjs";
import { chatError, chatJson, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// Everything the customer's Messenger panel needs besides the messages:
// structured order summary (items from the frozen order lines with catalog
// images), workflow state, read cursors, gamepass link slots and who is
// assisting (public username only). Owner only; anyone else gets the same
// 404 as a nonexistent order.
export async function GET(_request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, "customer");
  if (!actor.ok) return chatError(actor.error, actor.status);
  try {
    // All in parallel: the assistant lookup adds no round trip.
    const [summary, conversation, slots, publicNames, lastAdminId] = await Promise.all([
      loadCustomerOrderSummary(orderNumber),
      getConversation(orderNumber),
      loadCustomerFulfillment(orderNumber),
      loadPublicAdminNames(),
      lastAdminSenderId(orderNumber),
    ]);
    if (!summary) return chatError("Order not found.", 404);
    return chatJson({
      summary,
      adminRead: { at: conversation?.admin_read_at ?? null, messageId: conversation?.admin_read_message_id ?? null },
      ownRead: { at: conversation?.customer_read_at ?? null, messageId: conversation?.customer_read_message_id ?? null },
      slots,
      assistant: pickAssistant({
        assignedAdminId: conversation?.assigned_admin_id ?? null,
        lastAdminId,
        publicNames,
      }),
    });
  } catch (error) {
    return routeErrorResponse(error, "Load order summary");
  }
}
