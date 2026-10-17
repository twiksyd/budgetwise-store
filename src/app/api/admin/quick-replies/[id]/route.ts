import { isUuid } from "@/lib/order-chat.mjs";
import { validateQuickReplyInput } from "@/lib/chat/admin-input.mjs";
import { saveQuickReply } from "@/lib/queries/order-chat";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ id: string }> };

// PATCH {shortcut, title, body, isEnabled} — edit or enable/disable.
export async function PATCH(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return chatError("Not found.", 404);
  const input = validateQuickReplyInput(await readSmallJson(request, 16 * 1024));
  if (!input.ok) return chatError(input.error, 400);
  try {
    return chatJson({ reply: await saveQuickReply(gate.adminId, { id, ...input }) });
  } catch (error) {
    return routeErrorResponse(error, "Update quick reply");
  }
}
