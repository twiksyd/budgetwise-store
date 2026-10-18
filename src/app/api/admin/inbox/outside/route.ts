import { loadOutsideNeedsReply } from "@/lib/queries/order-chat";
import { chatError, chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";
import { parseGameIds } from "@/lib/chat/inbox-games.mjs";

// GET ?games=<id,id>&inquiries=0|1 — Active chats needing a reply that the
// game filter hides (0029). Re-read after realtime activity, debounced.
export async function GET(request: Request) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;
  const url = new URL(request.url);
  const games = parseGameIds(url.searchParams.get("games"));
  if (games === undefined) return chatError("Invalid games.", 400);
  try {
    return chatJson({ count: await loadOutsideNeedsReply(gate.adminId, games, url.searchParams.get("inquiries") !== "0") });
  } catch (error) {
    return routeErrorResponse(error, "Count chats outside the game filter");
  }
}
