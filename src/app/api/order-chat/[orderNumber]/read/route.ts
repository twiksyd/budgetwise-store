import { NextResponse } from "next/server";
import { markChatRead, resolveChatActor } from "@/lib/queries/order-chat";
import {
  chatError,
  isSameOriginRequest,
  parseActingAs,
} from "@/lib/order-chat-http";

type Context = { params: Promise<{ orderNumber: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return chatError("Not allowed.", 403);

  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);

  await markChatRead(orderNumber, actor.role);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
