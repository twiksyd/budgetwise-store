import { getSessionUserId, listCustomerConversations } from "@/lib/queries/order-chat";
import { chatError, chatJson, routeErrorResponse } from "@/lib/order-chat-http";

// The signed-in customer's conversations (unread counts from the server's
// read cursors) + their own id for the private customer:<id> realtime
// topic. Drives the floating message button and the My Orders badge.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return chatError("Please sign in.", 401);
  try {
    return chatJson({ userId, conversations: await listCustomerConversations(userId) });
  } catch (error) {
    return routeErrorResponse(error, "List customer conversations");
  }
}
