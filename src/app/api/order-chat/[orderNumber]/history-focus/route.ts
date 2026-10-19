import { createAdminClient } from "@/lib/supabase/admin";
import { conversationSources } from "@/lib/queries/chat-history";
import { isUuid, isValidOrderNumber } from "@/lib/order-chat.mjs";
import { getMessageInOrder, listMessages, resolveChatActor, toChatMessages } from "@/lib/queries/order-chat";
import { chatError, chatJson, parseActingAs, routeErrorResponse } from "@/lib/order-chat-http";
type Context = { params: Promise<{ orderNumber: string }> };
export async function GET(request: Request, { params }: Context) {
  const { orderNumber } = await params;
  const actor = await resolveChatActor(orderNumber, parseActingAs(request));
  if (!actor.ok) return chatError(actor.error, actor.status);
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("message");
    const order = url.searchParams.get("order");
    let target;
    if (id && isUuid(id)) target = await getMessageInOrder(orderNumber, id);
    else if (order && isValidOrderNumber(order)) {
      const sources = await conversationSources(orderNumber);
      if (sources.includes(order)) {
        const { data, error } = await createAdminClient().from("store_order_messages").select("*")
          .eq("order_number", order).order("created_at").order("id").limit(1).maybeSingle();
        if (error) throw error;
        target = data;
      } else {
        const { data, error } = await createAdminClient().from("store_order_messages").select("*")
          .eq("order_number", orderNumber).eq("order_ref", order).eq("kind", "slip").limit(1).maybeSingle();
        if (error) throw error;
        target = data;
      }
    }
    if (!target) return chatError("Not found.", 404);
    const before = await listMessages(orderNumber, { before: target.id, limit: 25 });
    const after = await listMessages(orderNumber, { after: target.id, limit: 24 });
    return chatJson({ messageId: target.id, messages: await toChatMessages([...before, target, ...after],
      { viewer: actor.role, viewerUserId: actor.userId, conversationKey: orderNumber }), hasOlder: before.length === 25 });
  } catch (error) { return routeErrorResponse(error, "Locate historical message"); }
}
