import { validateQuickReplyInput } from "@/lib/chat/admin-input.mjs";
import { listQuickReplies, saveQuickReply } from "@/lib/queries/order-chat";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

export async function GET(request: Request) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;
  try {
    return chatJson({ replies: await listQuickReplies() });
  } catch (error) {
    return routeErrorResponse(error, "List quick replies");
  }
}

// POST {shortcut, title, body, isEnabled} — created_by is the session admin.
export async function POST(request: Request) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const input = validateQuickReplyInput(await readSmallJson(request, 16 * 1024));
  if (!input.ok) return chatError(input.error, 400);
  try {
    const reply = await saveQuickReply(gate.adminId, { id: null, ...input });
    return chatJson({ reply }, 201);
  } catch (error) {
    return routeErrorResponse(error, "Create quick reply");
  }
}
