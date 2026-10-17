import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/admin";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import {
  getChatOrderHeader,
  getOrderStatus,
  listChatMessages,
} from "@/lib/queries/order-chat";
import { OrderChat } from "@/components/order-chat/order-chat";
import { OrderStatusBadge } from "@/components/order-chat/order-status-badge";
import { formatPrice } from "@/lib/pricing";
import { toChatMessage } from "@/types/order-chat";

export const metadata: Metadata = {
  title: "Order Chat",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminOrderChatPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  // Must run before any privileged read.
  await requireAdmin();

  const { orderNumber } = await params;
  if (!isValidOrderNumber(orderNumber)) notFound();

  const order = await getChatOrderHeader(orderNumber);
  if (!order) notFound();

  const [rows, status] = await Promise.all([
    listChatMessages(orderNumber),
    getOrderStatus(orderNumber),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/orders"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        All chats
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {order.orderNumber}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {order.buyerName} · Roblox: {order.buyerRobloxUsername}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={status} />
          <p className="font-heading text-lg font-semibold">
            {formatPrice(order.totalAmount)}
          </p>
        </div>
      </div>

      <OrderChat
        orderNumber={order.orderNumber}
        viewerRole="admin"
        initialMessages={rows.map(toChatMessage)}
      />
    </div>
  );
}
