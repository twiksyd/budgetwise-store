import { handleFulfillmentSave } from "@/lib/chat/route-core.mjs";
import {
  loadCustomerFulfillment,
  loadFulfillmentLines,
  resolveChatActor,
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

/** The signed-in customer's own structured details (e.g. gamepass links). */
export async function GET(_request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, "customer");
  if (!actor.ok) return chatError(actor.error, actor.status);
  try {
    return chatJson({ slots: await loadCustomerFulfillment(orderNumber) });
  } catch (error) {
    return routeErrorResponse(error, "Load fulfillment details");
  }
}

/** PUT {lineIndex, unitIndex, fieldKey, value} — owner only. */
export async function PUT(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  const { orderNumber } = await params;
  const body = await readSmallJson(request);

  try {
    const result = await handleFulfillmentSave({
      orderNumber,
      body,
      deps: {
        resolveActor: async (order) => {
          const actor = await resolveChatActor(order, "customer");
          return actor.ok ? { ok: true, userId: actor.userId } : { ok: false, status: actor.status };
        },
        loadLines: loadFulfillmentLines,
        save: (input) =>
          saveFulfillmentDetail({ ...input, orderNumber, actorRole: "customer" }),
      },
    });
    if (result.status !== 200) return sendCoreResult(result);
    return chatJson({ ...(result.body as object), slots: await loadCustomerFulfillment(orderNumber) });
  } catch (error) {
    return routeErrorResponse(error, "Save fulfillment detail");
  }
}
