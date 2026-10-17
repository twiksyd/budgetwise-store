import { getCustomerUser } from "@/lib/auth/customer";
import { listCustomerConversations } from "@/lib/queries/order-chat";
import { chatError, chatJson, routeErrorResponse } from "@/lib/order-chat-http";

// The signed-in customer's conversations (unread counts from the server's
// read cursors) + their own id for the private customer:<id> realtime
// topic and the email My Orders shows. Drives the floating message button
// and the My Orders badge.
export async function GET() {
  const user = await getCustomerUser();
  if (!user) return chatError("Please sign in.", 401);
  try {
    return chatJson({
      userId: user.id,
      email: user.email ?? user.name,
      conversations: await listCustomerConversations(user.id),
    });
  } catch (error) {
    return routeErrorResponse(error, "List customer conversations");
  }
}
