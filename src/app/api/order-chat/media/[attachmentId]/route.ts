import { handleAlbumMedia } from "@/lib/chat/route-core.mjs";
import { getAttachment, resolveOrderViewer, signAttachment } from "@/lib/queries/order-chat";
import { routeErrorResponse, sendCoreResult } from "@/lib/order-chat-http";

type Context = { params: Promise<{ attachmentId: string }> };

// One album image (?size=thumb for chat tiles, ?size=full for the viewer).
// Access is re-checked on every view (order owner or admin), then the
// browser is redirected to a 60-second signed URL of the private file.
export async function GET(request: Request, { params }: Context) {
  const { attachmentId } = await params;
  const size = new URL(request.url).searchParams.get("size") === "full" ? "full" : "thumb";
  try {
    const result = await handleAlbumMedia({
      attachmentId,
      size,
      deps: { loadAttachment: getAttachment, resolveViewer: resolveOrderViewer, sign: signAttachment },
    });
    return sendCoreResult(result);
  } catch (error) {
    return routeErrorResponse(error, "Open album image");
  }
}
