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
  // This page shows a customer's own details and its URL carries their
  // viewing token — it should never end up in a search index.
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ orderRef: string }>;
  // `t` is the order's viewing token. Keeping it in the URL (rather than in
  // a one-shot cookie or session) is what makes this link survive a refresh,
  // Back/Forward, and the customer reopening it later.
  searchParams: Promise<{ t?: string | string[] }>;
};

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: Props) {
  const { orderRef } = await params;
  const { t } = await searchParams;
  const viewToken = Array.isArray(t) ? t[0] : t;

  // A wrong or missing token is indistinguishable from an order that does
  // not exist, so a guessed BW number reveals nothing either way.
  const order = await getOrderConfirmation(orderRef, viewToken);

  if (!order) notFound();

  const message = buildOrderMessage(order);
  const messengerLink = getMessengerLink(order.orderNumber, message);

  return (
    <div className="mx-auto max-w-6xl px-6 py-5 sm:py-12">
      <ClearCartOnSuccess orderNumber={order.orderNumber} />
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
