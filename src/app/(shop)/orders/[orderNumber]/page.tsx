import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderChatScreen } from "@/components/order-chat/order-chat-screen";
import { ClearCartOnSuccess } from "@/components/checkout/clear-cart-on-success";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";

export const metadata: Metadata = {
  title: "Your Order",
  robots: { index: false, follow: false },
};

// No order is rendered at build time; each page is generated on its first
// visit and then served from cache. It holds no order data — only the
// order number from the URL — so it can be prefetched in full and opens
// the moment "Chat" is tapped. Messages and the order summary load in the
// browser from the chat APIs, which check the session and that the order
// belongs to this customer (someone else's order looks exactly like a
// nonexistent one).
export function generateStaticParams() {
  return [];
}

export default async function CustomerOrderPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) notFound();

  return (
    <>
      <ClearCartOnSuccess orderNumber={orderNumber} />
      <OrderChatScreen orderNumber={orderNumber} />
    </>
  );
}
