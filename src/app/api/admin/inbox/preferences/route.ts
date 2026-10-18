import { saveInboxPreferences } from "@/lib/queries/order-chat";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";
import { parseGameIds } from "@/lib/chat/inbox-games.mjs";

// PUT {games: string[] | null, includeInquiries: boolean} — the signed-in
// admin's own game filter (0029). The admin id comes from the session.
export async function PUT(request: Request) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const body = (await readSmallJson(request)) as { games?: unknown; includeInquiries?: unknown } | null;
  if (!body || typeof body.includeInquiries !== "boolean") return chatError("Invalid request.", 400);
  const games =
    body.games === null ? null : Array.isArray(body.games) ? parseGameIds(body.games.join(",")) : undefined;
  if (games === undefined) return chatError("Invalid games.", 400);
  try {
    await saveInboxPreferences(gate.adminId, { games, includeInquiries: body.includeInquiries });
    return chatJson({ games, includeInquiries: body.includeInquiries });
  } catch (error) {
    return routeErrorResponse(error, "Save inbox preferences");
  }
}
