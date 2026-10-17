import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { OrderChat } from "@/components/order-chat/order-chat";
import { OrderStatusBadge } from "@/components/order-chat/order-status-badge";
import { ClearCartOnSuccess } from "@/components/checkout/clear-cart-on-success";
import { Price } from "@/components/shared/price";
import { requireCustomer } from "@/lib/auth/customer";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import {
  getChatOrderHeader,
  getOrderStatus,
  listChatMessages,
} from "@/lib/queries/order-chat";
import { toChatMessage } from "@/types/order-chat";

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
  const order = await getChatOrderHeader(orderNumber);

  // Someone else's order and a nonexistent one look identical.
  if (!order || order.ownerUserId !== customer.id) notFound();

  const [rows, status] = await Promise.all([
    listChatMessages(orderNumber),
    getOrderStatus(orderNumber),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12">
      <ClearCartOnSuccess orderNumber={order.orderNumber} />

      <Link
        href="/account/orders"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        My orders
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            Order slip ready
          </p>
          <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Order {order.orderNumber}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={status} />
            <span className="text-muted-foreground text-xs">
              Roblox: {order.buyerRobloxUsername}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs font-medium">Total</p>
          <Price amount={order.totalAmount} variant="summary" />
        </div>
      </div>

      <div className="mt-5 flex gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-950 dark:text-amber-100">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase">
            Wait for our reply
          </p>
          <p className="mt-1 text-sm leading-relaxed font-semibold">
            Hintayin muna ang reply at official payment instructions namin
            dito sa chat bago magsend ng payment.
          </p>
        </div>
      </div>

      <OrderChat
        className="mt-5"
        orderNumber={order.orderNumber}
        viewerRole="customer"
        initialMessages={rows.map(toChatMessage)}
      />

      <p className="text-muted-foreground mt-4 text-center text-xs leading-relaxed">
        Bumalik lang dito anumang oras — naka-save ang chat sa inyong account sa{" "}
        <Link href="/account/orders" className="underline underline-offset-2">
          My orders
        </Link>
        .
      </p>
    </div>
  );
}
