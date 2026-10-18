import { createRateLimiter } from "@/lib/chat/rate-limit.mjs";
import { ADMIN_INBOX_TOPIC, publishBroadcast } from "@/lib/chat/server/realtime";
import { resolveChatActor } from "@/lib/queries/order-chat";
import { chatError, chatJson, isSameOriginRequest, readSmallJson } from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

// Clients send at most one "typing" per 2.5 s plus a "stopped"; this is
// only a backstop against abuse.
const limiter = createRateLimiter({ limit: 30, windowMs: 20_000 });

// POST {state: "typing" | "stopped"} — the CUSTOMER is composing (0032).
// Server-published to admins only; nothing is written to the database.
// Admins' own typing goes through /api/admin/inbox/signal.
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, "customer");
  if (!actor.ok) return chatError(actor.error, actor.status);
  const body = (await readSmallJson(request, 256)) as { state?: unknown } | null;
  if (body?.state !== "typing" && body?.state !== "stopped") return chatError("Invalid request.", 400);
  if (!limiter.take(actor.userId).ok) return chatJson({ ok: false }, 429);
  await publishBroadcast(ADMIN_INBOX_TOPIC, "signal", {
    type: body.state === "typing" ? "customer_typing" : "customer_stopped",
    order_number: orderNumber,
    at: new Date().toISOString(),
  });
  return chatJson({ ok: true }, 202);
}
