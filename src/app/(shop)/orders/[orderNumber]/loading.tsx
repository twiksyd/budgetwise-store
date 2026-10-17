"use client";

import { useParams } from "next/navigation";
import { OrderChatScreen } from "@/components/order-chat/order-chat-screen";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";

// Shown the instant a chat is tapped if the page itself is not cached yet:
// the real chat screen, painted from the in-memory chat cache when this
// conversation was opened before.
export default function Loading() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  if (!isValidOrderNumber(orderNumber)) return null;
  return <OrderChatScreen orderNumber={orderNumber} />;
}
