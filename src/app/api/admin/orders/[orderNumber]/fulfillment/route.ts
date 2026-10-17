import { handleFulfillmentSave } from "@/lib/chat/route-core.mjs";
import {
  getSessionAdminId,
  loadFulfillmentLines,
  loadOrderDetails,
  saveFulfillmentDetail,
} from "@/lib/queries/order-chat";
import {
  chatError,
  chatJson,
  isSameOriginRequest,
  readSmallJson,
  routeErrorResponse,
  sendCoreResult,
} from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// PUT {lineIndex, unitIndex, fieldKey, value} — admin correction. Same
// validation as the customer path; audited in the database with the admin's
// id, the previous value and the new value.
export async function PUT(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  const { orderNumber } = await params;
  const body = await readSmallJson(request);
  try {
    const result = await handleFulfillmentSave({
      orderNumber,
      body,
      deps: {
        resolveActor: async () => {
          const adminId = await getSessionAdminId();
          return adminId ? { ok: true, userId: adminId } : { ok: false, status: 403 };
        },
        loadLines: loadFulfillmentLines,
        save: (input) => saveFulfillmentDetail({ ...input, orderNumber, actorRole: "admin" }),
      },
    });
    if (result.status !== 200) return sendCoreResult(result);
    return chatJson({ ...(result.body as object), details: await loadOrderDetails(orderNumber) });
  } catch (error) {
    return routeErrorResponse(error, "Correct fulfillment detail");
  }
}
