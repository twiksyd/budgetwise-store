import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderConfirmation } from "@/lib/queries/orders";
import { getMessengerLink, buildOrderMessage } from "@/lib/messenger";
import { MessengerHandoff } from "@/components/checkout/messenger-handoff";
import { OrderConfirmationSummary } from "@/components/checkout/order-confirmation-summary";
import { ClearCartOnSuccess } from "@/components/checkout/clear-cart-on-success";
import { OrderingProgress } from "@/components/ordering/ordering-progress";

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
    <div className="mx-auto max-w-6xl px-6 py-5 sm:py-12">
      <ClearCartOnSuccess />
      <OrderingProgress
        currentStep={4}
        compact
        description="I-send ang buong order message sa Messenger para ma-review namin."
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <MessengerHandoff
          message={message}
          messengerLink={messengerLink}
          orderNumber={order.orderNumber}
        />
        <OrderConfirmationSummary order={order} />
      </div>
    </div>
  );
}
