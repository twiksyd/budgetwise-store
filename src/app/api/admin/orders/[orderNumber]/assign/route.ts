import { isUuid } from "@/lib/order-chat.mjs";
import { assignConversation } from "@/lib/queries/order-chat";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// POST {assigneeId: <admin uuid> | null}. The actor is the session admin;
// the database rejects assignees who are not in admin_users and audits it.
export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  const body = (await readSmallJson(request)) as { assigneeId?: unknown } | null;
  const assigneeId = body?.assigneeId ?? null;
  if (assigneeId !== null && !isUuid(assigneeId)) return chatError("Invalid request.", 400);
  try {
    return chatJson({ assignment: await assignConversation(orderNumber, assigneeId, gate.adminId) });
  } catch (error) {
    return routeErrorResponse(error, "Assign conversation");
  }
}
