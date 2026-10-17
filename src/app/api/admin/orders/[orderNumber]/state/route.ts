import { isUuid, isValidOrderNumber } from "@/lib/order-chat.mjs";
import { setConversationState } from "@/lib/queries/order-chat";
import { chatError, chatJson, readSmallJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// POST {state: "done" | "active", lastSeenMessageId}
// Mark Done / Reopen — BudgetWise's own conversation workflow, never XOB's
// order status. The actor is the session admin; the database audits it and
// refuses Done if a customer message arrived after lastSeenMessageId (409).
export async function POST(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) return chatError("Not found.", 404);
  const body = (await readSmallJson(request)) as { state?: unknown; lastSeenMessageId?: unknown } | null;
  const state = body?.state;
  if (state !== "done" && state !== "active") return chatError("Invalid request.", 400);
  const lastSeen = body?.lastSeenMessageId ?? null;
  if (state === "done" && !isUuid(lastSeen)) return chatError("Invalid request.", 400);
  try {
    const row = await setConversationState({
      orderNumber,
      actorId: gate.adminId,
      state,
      lastSeenMessageId: state === "done" ? (lastSeen as string) : null,
    });
    return chatJson({ state: row.state, doneAt: row.done_at, doneBy: row.done_by });
  } catch (error) {
    return routeErrorResponse(error, "Set conversation state");
  }
}
