import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderConfirmation } from "@/lib/queries/orders";
import { getMessengerLink, buildOrderMessage } from "@/lib/messenger";
import { MessengerHandoff } from "@/components/checkout/messenger-handoff";
import { SuccessHeader } from "@/components/checkout/success-header";
import { formatPrice } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Order confirmed",
};

type Props = {
  params: Promise<{ orderRef: string }>;
};

export default async function CheckoutSuccessPage({ params }: Props) {
  const { orderRef } = await params;
  const order = await getOrderConfirmation(orderRef);

  if (!order) notFound();

  const message = buildOrderMessage(order);
  const messengerLink = getMessengerLink(order.orderNumber, message);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <SuccessHeader
        orderNumber={order.orderNumber}
        subtitle={`Total: ${formatPrice(order.total)} · Deliver to ${order.buyerRobloxUsername}`}
      />

      <div className="mt-8">
        <MessengerHandoff message={message} messengerLink={messengerLink} />
      </div>
    </div>
  );
}
