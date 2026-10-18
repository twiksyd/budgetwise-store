import { loadInboxPage, loadOutsideNeedsReply, parseInboxFilter } from "@/lib/queries/order-chat";
import { chatError, chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import { parseGameIds } from "@/lib/chat/inbox-games.mjs";

// GET ?filter=all|unread|unassigned|mine|under_review|needs_reply&search=&beforeAt=&beforeOrder=
//     &games=<id,id>|all &inquiries=0|1   (0029: personal game filter)
export async function GET(request: Request) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const beforeAt = url.searchParams.get("beforeAt");
  const beforeOrder = url.searchParams.get("beforeOrder");
  if ((beforeAt && Number.isNaN(Date.parse(beforeAt))) || (beforeOrder && !isValidOrderNumber(beforeOrder))) {
    return chatError("Invalid cursor.", 400);
  }
  const games = parseGameIds(url.searchParams.get("games"));
  if (games === undefined) return chatError("Invalid games.", 400);
  const includeInquiries = url.searchParams.get("inquiries") !== "0";

  try {
    const before = beforeAt && beforeOrder ? { at: beforeAt, orderNumber: beforeOrder } : null;
    const [page, outsideNeedsReply] = await Promise.all([
      loadInboxPage(gate.adminId, {
        filter: parseInboxFilter(url.searchParams.get("filter")),
        search: url.searchParams.get("search") ?? "",
        before,
        games,
        includeInquiries,
      }),
      // First page only: how many urgent chats the game filter hides.
      before ? Promise.resolve(undefined) : loadOutsideNeedsReply(gate.adminId, games, includeInquiries),
    ]);
    return chatJson({ ...page, outsideNeedsReply });
  } catch (error) {
    return routeErrorResponse(error, "Load inbox");
  }
}
