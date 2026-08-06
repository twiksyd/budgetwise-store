import type { OrderConfirmation } from "@/lib/queries/orders";

export function normalizePlainTextMessage(message: string): string;
export function buildOrderMessage(order: OrderConfirmation): string;
