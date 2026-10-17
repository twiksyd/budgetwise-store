import { getSessionUserId, loadCustomerOrderSection } from "@/lib/queries/order-chat";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import { chatError, chatJson, routeErrorResponse } from "@/lib/order-chat-http";

// GET ?section=open|completed[&beforeAt=&beforeOrder=]
// My Orders for the signed-in customer only (the id comes from the session).
export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return chatError("Please sign in.", 401);
  const url = new URL(request.url);
  const section = url.searchParams.get("section") === "completed" ? "completed" : "open";
  const beforeAt = url.searchParams.get("beforeAt");
  const beforeOrder = url.searchParams.get("beforeOrder");
  let cursor = null;
  if (beforeAt || beforeOrder) {
    if (!beforeAt || Number.isNaN(Date.parse(beforeAt)) || !beforeOrder || !isValidOrderNumber(beforeOrder)) {
      return chatError("Invalid cursor.", 400);
    }
    cursor = { at: beforeAt, orderNumber: beforeOrder };
  }
  try {
    return chatJson(await loadCustomerOrderSection(userId, section, cursor));
  } catch (error) {
    return routeErrorResponse(error, "List customer orders");
  }
}
