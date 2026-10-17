import { loadInboxPage, parseInboxFilter } from "@/lib/queries/order-chat";
import { chatError, chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";

// GET ?filter=all|unread|unassigned|mine|under_review&search=&beforeAt=&beforeOrder=
export async function GET(request: Request) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const beforeAt = url.searchParams.get("beforeAt");
  const beforeOrder = url.searchParams.get("beforeOrder");
  if ((beforeAt && Number.isNaN(Date.parse(beforeAt))) || (beforeOrder && !isValidOrderNumber(beforeOrder))) {
    return chatError("Invalid cursor.", 400);
  }

  try {
    const page = await loadInboxPage(gate.adminId, {
      filter: parseInboxFilter(url.searchParams.get("filter")),
      search: url.searchParams.get("search") ?? "",
      before: beforeAt && beforeOrder ? { at: beforeAt, orderNumber: beforeOrder } : null,
    });
    return chatJson(page);
  } catch (error) {
    return routeErrorResponse(error, "Load inbox");
  }
}
