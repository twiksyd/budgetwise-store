"use client";

import { CustomerOrderChat } from "@/components/order-chat/customer-order-chat";
import { MessengerViewport } from "@/components/order-chat/messenger-viewport";

/** The full-screen chat for one order (the order page and its loading state). */
export function OrderChatScreen({ orderNumber }: { orderNumber: string }) {
  return (
    <MessengerViewport>
      <CustomerOrderChat orderNumber={orderNumber} />
    </MessengerViewport>
  );
}
