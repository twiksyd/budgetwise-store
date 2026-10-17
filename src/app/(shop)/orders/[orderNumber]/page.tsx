import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerOrderChat } from "@/components/order-chat/customer-order-chat";
import { MessengerViewport } from "@/components/order-chat/messenger-viewport";
import { ClearCartOnSuccess } from "@/components/checkout/clear-cart-on-success";
import { requireCustomer } from "@/lib/auth/customer";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import {
  MESSAGE_PAGE_SIZE,
  countCustomerOrders,
  getChatOrder,
  getConversation,
  listMessages,
  loadCustomerFulfillment,
  loadCustomerOrderSummary,
  toChatMessages,
} from "@/lib/queries/order-chat";

export const metadata: Metadata = {
  title: "Your Order",
  robots: { index: false, follow: false },
};

export default async function CustomerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) notFound();

  const customer = await requireCustomer(`/orders/${orderNumber}`);
  const order = await getChatOrder(orderNumber);
  // Someone else's order and a nonexistent one look identical.
  if (!order || order.ownerUserId !== customer.id) notFound();

  const { placed } = await searchParams;
  const [rows, summary, conversation, slots, orderCount] = await Promise.all([
    listMessages(orderNumber, { limit: MESSAGE_PAGE_SIZE }),
    loadCustomerOrderSummary(orderNumber),
    getConversation(orderNumber),
    loadCustomerFulfillment(orderNumber),
    placed ? countCustomerOrders(customer.id) : Promise.resolve(0),
  ]);
  if (!summary) notFound();
  const messages = await toChatMessages(rows, { viewer: "customer", viewerUserId: customer.id });

  return (
    <MessengerViewport>
      <ClearCartOnSuccess orderNumber={order.orderNumber} />
      <CustomerOrderChat
        orderNumber={order.orderNumber}
        variant="page"
        // First order only: a two-line "what happens next".
        welcome={Boolean(placed) && orderCount <= 1}
        initial={{
          summary,
          messages,
          hasOlder: rows.length === MESSAGE_PAGE_SIZE,
          adminRead: {
            at: conversation?.admin_read_at ?? null,
            messageId: conversation?.admin_read_message_id ?? null,
          },
          ownRead: {
            at: conversation?.customer_read_at ?? null,
            messageId: conversation?.customer_read_message_id ?? null,
          },
          slots: slots.map((slot) => ({
            lineIndex: slot.lineIndex,
            unitIndex: slot.unitIndex,
            unitCount: slot.unitCount,
            fieldKey: slot.fieldKey,
            label: slot.label,
            status: slot.status,
            value: slot.value,
            productName: slot.productName,
            gameName: slot.gameName,
          })),
        }}
      />
    </MessengerViewport>
  );
}
