import { notFound } from "next/navigation";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import { ConversationView } from "@/components/admin-inbox/conversation-view";

// Data is loaded client-side through the admin APIs (each re-checks the
// session), which keeps switching between conversations instant.
export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) notFound();
  return <ConversationView key={orderNumber} orderNumber={orderNumber} />;
}
