import { historicalHome } from "@/lib/queries/chat-history";
import { loadOrderDetails } from "@/lib/queries/order-chat";
import { chatError, chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// Right-hand Order Details panel: order records only, never chat text.
export async function GET(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;
  const { orderNumber } = await params;
  try {
    const details = await loadOrderDetails(orderNumber);
    return details ? chatJson({ details: { ...details, readOnlyHome: await historicalHome(orderNumber) } }) : chatError("Not found.", 404);
  } catch (error) {
    return routeErrorResponse(error, "Load order details");
  }
}
