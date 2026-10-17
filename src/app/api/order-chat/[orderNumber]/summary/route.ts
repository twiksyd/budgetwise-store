import {
  getConversation,
  loadCustomerFulfillment,
  loadCustomerOrderSummary,
  resolveChatActor,
} from "@/lib/queries/order-chat";
import { chatError, chatJson, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// Everything the customer's Messenger panel needs besides the messages:
// structured order summary (items from the frozen order lines with catalog
// images), workflow state, read cursors and gamepass link slots. Owner only;
// anyone else gets the same 404 as a nonexistent order.
export async function GET(_request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, "customer");
  if (!actor.ok) return chatError(actor.error, actor.status);
  try {
    const [summary, conversation, slots] = await Promise.all([
      loadCustomerOrderSummary(orderNumber),
      getConversation(orderNumber),
      loadCustomerFulfillment(orderNumber),
    ]);
    if (!summary) return chatError("Order not found.", 404);
    return chatJson({
      summary,
      adminRead: { at: conversation?.admin_read_at ?? null, messageId: conversation?.admin_read_message_id ?? null },
      ownRead: { at: conversation?.customer_read_at ?? null, messageId: conversation?.customer_read_message_id ?? null },
      slots,
    });
  } catch (error) {
    return routeErrorResponse(error, "Load order summary");
  }
}
