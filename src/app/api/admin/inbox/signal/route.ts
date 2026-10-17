import { createRateLimiter } from "@/lib/chat/rate-limit.mjs";
import { createSignalHandler, SIGNAL_RATE_LIMIT } from "@/lib/chat/signals.mjs";
import { publishAdminSignal } from "@/lib/chat/server/realtime";
import { getSessionAdminId } from "@/lib/queries/order-chat";
import { chatError, chatJson, isSameOriginRequest, readSmallJson, routeErrorResponse } from "@/lib/order-chat-http";

// Per server instance; clients throttle themselves well below this.
const limiter = createRateLimiter(SIGNAL_RATE_LIMIT);

const handleSignal = createSignalHandler({
  resolveAdmin: async () => {
    const adminId = await getSessionAdminId();
    return adminId ? { id: adminId } : null;
  },
  publish: publishAdminSignal,
  limiter,
});

// POST {type: viewing|typing|stopped|left, orderNumber}
// Also accepts text/plain bodies from navigator.sendBeacon on page hide.
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  try {
    const result = await handleSignal(await readSmallJson(request, 1024));
    return chatJson(result.body, result.status);
  } catch (error) {
    return routeErrorResponse(error, "Publish admin signal");
  }
}
