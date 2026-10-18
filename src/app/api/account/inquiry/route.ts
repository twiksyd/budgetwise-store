import { getCustomerUser } from "@/lib/auth/customer";
import { openCustomerInquiry } from "@/lib/queries/order-chat";
import { chatError, chatJson, isSameOriginRequest, routeErrorResponse } from "@/lib/order-chat-http";

// POST: the signed-in customer's one General Inquiry — returned if it
// exists, created on first use (migration 0026). Customers without any
// order message BudgetWise here. The key only identifies the customer's own
// thread; every chat endpoint still checks that it belongs to them.
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  const user = await getCustomerUser();
  if (!user) return chatError("Please sign in first.", 401);
  try {
    const key = await openCustomerInquiry(user.id, user.name ?? user.email);
    return chatJson({ key });
  } catch (error) {
    return routeErrorResponse(error, "Open general inquiry");
  }
}
