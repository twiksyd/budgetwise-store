import { notFound } from "next/navigation";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";

// Reloads and shared links land here. The inbox shell (layout) reads the
// order number from the URL and opens it client-side; switching between
// conversations afterwards never comes back to the server for this page.
// Data is loaded through the admin APIs, each of which re-checks the session.
export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) notFound();
  return null;
}
