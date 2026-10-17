import { loadInboxRow } from "@/lib/queries/order-chat";
import { chatError, chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// One inbox row — what the client fetches for a brand-new chat or a row it
// cannot recompute exactly. Never the whole inbox.
export async function GET(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  try {
    const row = await loadInboxRow(gate.adminId, orderNumber);
    return row ? chatJson({ row }) : chatError("Not found.", 404);
  } catch (error) {
    return routeErrorResponse(error, "Load inbox row");
  }
}
