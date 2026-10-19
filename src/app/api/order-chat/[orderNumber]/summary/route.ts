import {
  getConversation,
  lastAdminSenderId,
  loadConversationOrders,
  loadCustomerFulfillment,
  loadCustomerOrderSummary,
  isMessengerOrder,
  loadPublicAdminNames,
  resolveChatActor,
} from "@/lib/queries/order-chat";
import { orderMessengerLink } from "@/lib/order-handoff.mjs";
import { siteConfig } from "@/config/site";
import { historicalHome, historySourceStatus } from "@/lib/queries/chat-history";
import { getOrderHomeKey } from "@/lib/queries/customer-thread";
import { isInquiryKey } from "@/lib/order-chat.mjs";
import { pickAssistant } from "@/lib/chat/assistant.mjs";
import { chatError, chatJson, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// Everything the customer's Messenger panel needs besides the messages:
// structured order summary (items from the frozen order lines with catalog
// images), workflow state, read cursors, gamepass link slots and who is
// assisting (public username only). Owner only; anyone else gets the same
// 404 as a nonexistent order.
//
// 0033: an order that lives in the customer's conversation answers
// { movedTo } (the client opens the conversation at that order); the
// conversation itself lists its orders.
export async function GET(_request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, "customer");
  if (!actor.ok) return chatError(actor.error, actor.status);
  try {
    const inquiry = isInquiryKey(orderNumber);
    if (!inquiry) {
      const homeKey = await getOrderHomeKey(orderNumber);
      if (homeKey) return chatJson({ movedTo: homeKey });
      // An order that continues on Messenger has no on-site chat.
      if (await isMessengerOrder(orderNumber)) {
        const summary = await loadCustomerOrderSummary(orderNumber);
        if (!summary) return chatError("Order not found.", 404);
        return chatJson({
          summary,
          messenger: orderMessengerLink(siteConfig.messengerPageId, orderNumber),
          adminRead: { at: null, messageId: null },
          ownRead: { at: null, messageId: null },
          slots: [],
        });
      }
    }
    // All in parallel: the assistant lookup adds no round trip.
    const [summary, conversation, slots, publicNames, lastAdminId, conversationOrders] = await Promise.all([
      loadCustomerOrderSummary(orderNumber),
      getConversation(orderNumber),
      inquiry ? Promise.resolve([]) : loadCustomerFulfillment(orderNumber),
      loadPublicAdminNames(),
      lastAdminSenderId(orderNumber),
      inquiry ? loadConversationOrders(orderNumber) : Promise.resolve(null),
    ]);
    if (!summary) return chatError("Order not found.", 404);
    return chatJson({
      summary,
      historySources: (await historySourceStatus([orderNumber]))[orderNumber] ?? [],
      readOnlyHome: inquiry ? null : await historicalHome(orderNumber),
      adminRead: { at: conversation?.admin_read_at ?? null, messageId: conversation?.admin_read_message_id ?? null },
      ownRead: { at: conversation?.customer_read_at ?? null, messageId: conversation?.customer_read_message_id ?? null },
      slots,
      ...(conversationOrders ? { orders: conversationOrders.orders, orderTotal: conversationOrders.total } : {}),
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
