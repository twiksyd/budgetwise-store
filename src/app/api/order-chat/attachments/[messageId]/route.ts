import { NextResponse } from "next/server";
import {
  createAttachmentSignedUrl,
  getMessageForAttachment,
  resolveChatActor,
} from "@/lib/queries/order-chat";
import { chatError } from "@/lib/order-chat-http";

type Context = { params: Promise<{ messageId: string }> };

// Attachments are private. Every view goes through here so access is checked
// each time; the redirect target is a signed URL that expires in a minute.
export async function GET(_request: Request, { params }: Context) {
  const { messageId } = await params;
  const message = await getMessageForAttachment(messageId);
  if (!message?.attachment_path) return chatError("Not found.", 404);

  // The order's owner, or a store admin. Both resolve through the same gate
  // the message endpoints use.
  let actor = await resolveChatActor(message.order_number, "customer");
  if (!actor.ok && actor.status === 404) {
    actor = await resolveChatActor(message.order_number, "admin");
  }
  if (!actor.ok) return chatError("Not found.", actor.status === 401 ? 401 : 404);

  const signedUrl = await createAttachmentSignedUrl(message.attachment_path);
  return NextResponse.redirect(signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
