import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerOrderChat } from "@/components/order-chat/customer-order-chat";
import { OrderStatusBadge } from "@/components/order-chat/order-status-badge";
import { ClearCartOnSuccess } from "@/components/checkout/clear-cart-on-success";
import { Price } from "@/components/shared/price";
import { requireCustomer } from "@/lib/auth/customer";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import { toChatMessage } from "@/lib/chat/dto.mjs";
import {
  MESSAGE_PAGE_SIZE,
  getChatOrder,
  getConversation,
  getOrderStatus,
  listMessages,
  loadCustomerFulfillment,
} from "@/lib/queries/order-chat";

export const metadata: Metadata = {
  title: "Your Order",
  robots: { index: false, follow: false },
};

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) notFound();

  const customer = await requireCustomer(`/orders/${orderNumber}`);
  const order = await getChatOrder(orderNumber);
  // Someone else's order and a nonexistent one look identical.
  if (!order || order.ownerUserId !== customer.id) notFound();

  const [rows, status, conversation, slots] = await Promise.all([
    listMessages(orderNumber, { limit: MESSAGE_PAGE_SIZE }),
    getOrderStatus(orderNumber),
    getConversation(orderNumber),
    loadCustomerFulfillment(orderNumber),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 sm:px-6 sm:py-10">
      <ClearCartOnSuccess orderNumber={order.orderNumber} />

      <Link
        href="/account/orders"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        My orders
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Order</p>
          <h1 className="font-heading mt-0.5 text-2xl font-semibold tracking-tight [font-variant-numeric:tabular-nums] sm:text-3xl">
            {order.orderNumber}
          </h1>
          <div className="mt-2">
            <OrderStatusBadge status={status} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs font-medium">Total</p>
          <Price amount={order.totalAmount} variant="summary" />
        </div>
      </div>

      <div className="mt-5">
        <CustomerOrderChat
          orderNumber={order.orderNumber}
          conversationId={conversation?.id ?? null}
          initialMessages={rows.map((row) => toChatMessage(row, { viewer: "customer", viewerUserId: customer.id }))}
          initialHasOlder={rows.length === MESSAGE_PAGE_SIZE}
          initialAdminRead={{
            at: conversation?.admin_read_at ?? null,
            messageId: conversation?.admin_read_message_id ?? null,
          }}
          initialOwnRead={{
            at: conversation?.customer_read_at ?? null,
            messageId: conversation?.customer_read_message_id ?? null,
          }}
          initialPaymentSent={Boolean(conversation?.payment_details_sent_at)}
          initialSlots={slots.map((slot) => ({
            lineIndex: slot.lineIndex,
            unitIndex: slot.unitIndex,
            unitCount: slot.unitCount,
            fieldKey: slot.fieldKey,
            label: slot.label,
            status: slot.status,
            value: slot.value,
            productName: slot.productName,
            gameName: slot.gameName,
          }))}
        />
      </div>
    </div>
  );
}
