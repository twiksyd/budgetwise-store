import { handlePaymentQr } from "@/lib/chat/route-core.mjs";
import {
  getMessageInOrder,
  resolveOrderViewer,
  signPaymentQr,
} from "@/lib/queries/order-chat";
import { routeErrorResponse, sendCoreResult } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string; messageId: string }> };

// The QR attached to one payment message. The storage path is resolved from
// the stored message on the server; the URL can only name an order and a
// message id. Order owner or admin only; 60-second signed URL.
export async function GET(_request: Request, { params }: Context) {
  const { orderNumber, messageId } = await params;
  try {
    const result = await handlePaymentQr({
      orderNumber,
      messageId,
      deps: {
        resolveViewer: resolveOrderViewer,
        loadMessage: getMessageInOrder,
        signQr: signPaymentQr,
      },
    });
    return sendCoreResult(result);
  } catch (error) {
    return routeErrorResponse(error, "Open payment QR");
  }
}
