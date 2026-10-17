import { handleAttachment } from "@/lib/chat/route-core.mjs";
import {
  getMessageById,
  resolveOrderViewer,
  signAttachment,
} from "@/lib/queries/order-chat";
import { routeErrorResponse, sendCoreResult } from "@/lib/order-chat-http";

type Context = { params: Promise<{ messageId: string }> };

// Private receipts/images. Access is re-checked on every view (order owner
// or admin), then the browser is redirected to a 60-second signed URL.
export async function GET(_request: Request, { params }: Context) {
  const { messageId } = await params;
  try {
    const result = await handleAttachment({
      messageId,
      deps: {
        loadMessage: getMessageById,
        resolveViewer: resolveOrderViewer,
        signAttachment,
      },
    });
    return sendCoreResult(result);
  } catch (error) {
    return routeErrorResponse(error, "Open chat attachment");
  }
}
