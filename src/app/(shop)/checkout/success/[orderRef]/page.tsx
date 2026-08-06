import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderConfirmation } from "@/lib/queries/orders";
import { getMessengerLink, buildOrderMessage } from "@/lib/messenger";
import { MessengerHandoff } from "@/components/checkout/messenger-handoff";
import { SuccessHeader } from "@/components/checkout/success-header";
import { OrderConfirmationSummary } from "@/components/checkout/order-confirmation-summary";
import { ClearCartOnSuccess } from "@/components/checkout/clear-cart-on-success";

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
    <div className="mx-auto max-w-xl px-6 py-8 sm:py-16">
      <ClearCartOnSuccess />
      <SuccessHeader orderNumber={order.orderNumber} />

      <div className="mt-5">
        <MessengerHandoff message={message} messengerLink={messengerLink} />
      </div>

      <div className="mt-6">
        <OrderConfirmationSummary order={order} />
      </div>
    </div>
  );
}
