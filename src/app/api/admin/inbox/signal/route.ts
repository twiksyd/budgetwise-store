import { createRateLimiter } from "@/lib/chat/rate-limit.mjs";
import { createSignalHandler, SIGNAL_RATE_LIMIT } from "@/lib/chat/signals.mjs";
import { publishAdminSignal, publishBroadcast } from "@/lib/chat/server/realtime";
import { getConversation, getSessionAdminId, loadPublicAdminNames } from "@/lib/queries/order-chat";
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
  // 0032: the customer sees "Twicks is typing…" on their own chat topic.
  // Only the public username (or null = "BudgetWise") — never an id or email.
  afterPublish: async (event: { type: string; admin_user_id: string; order_number: string }) => {
    if (event.type !== "typing" && event.type !== "stopped" && event.type !== "left") return;
    const [conversation, names] = await Promise.all([getConversation(event.order_number), loadPublicAdminNames()]);
    if (!conversation?.id) return;
    await publishBroadcast(`chat:${conversation.id}`, "typing", {
      state: event.type === "typing" ? "typing" : "stopped",
      name: names.get(event.admin_user_id) ?? null,
    });
  },
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
