import { notFound, redirect } from "next/navigation";
import { isInquiryKey, isValidOrderNumber } from "@/lib/order-chat.mjs";
import { requireAdmin } from "@/lib/auth/admin";
import { getOrderHomeKey } from "@/lib/queries/customer-thread";

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
  // 0033: an order whose chat is its customer's conversation opens there
  // (old links, bookmarks). Admins only, like the layout.
  if (!isInquiryKey(orderNumber)) {
    await requireAdmin();
    const homeKey = await getOrderHomeKey(orderNumber);
    if (homeKey) redirect(`/admin/orders/${encodeURIComponent(homeKey)}?focus=${encodeURIComponent(orderNumber)}`);
  }
  return null;
}
