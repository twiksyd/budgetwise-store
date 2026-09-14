import type { OrderSnapshotLine } from "@/lib/order-snapshot.mjs";

export const ORDER_NUMBER_COLLISION_CODE: string;
export const IDEMPOTENCY_KEY_REUSED_CODE: string;
export const ORDER_CREATE_RETRY_CODE: string;
export const MAX_ORDER_NUMBER_ATTEMPTS: number;

export type OrderPersistenceReason =
  | "idempotency_conflict"
  | "order_number_exhausted";

export class OrderPersistenceError extends Error {
  constructor(message: string, reason: OrderPersistenceReason);
  reason: OrderPersistenceReason;
}

export function isOrderNumberCollision(error: unknown): boolean;
export function isIdempotencyKeyReused(error: unknown): boolean;
export function isOrderCreateRetry(error: unknown): boolean;

export function resolveReplayedOrder(
  existing: { orderNumber: string; requestFingerprint: string } | null,
  requestFingerprint: string,
): PersistedStoreOrder | null;

export interface StoreOrderRequest {
  idempotencyKey: string;
  requestFingerprint: string;
  viewTokenHash: string;
  buyerName: string;
  buyerRobloxUsername: string;
  totalAmount: number;
  lines: OrderSnapshotLine[];
  viaPlus: {
    roblox_display_name: string;
    age_16_confirmed: boolean;
    verified_account_confirmed: boolean;
    via_plus_robux_amount: number;
  } | null;
}

export interface PersistedStoreOrder {
  orderNumber: string;
  replayed: boolean;
}

export function persistStoreOrder(input: {
  request: StoreOrderRequest;
  findExistingOrder?: (
    idempotencyKey: string,
  ) => Promise<{ orderNumber: string; requestFingerprint: string } | null>;
  createOrder: (
    input: StoreOrderRequest & { orderNumber: string },
  ) => Promise<{ orderNumber: string; replayed?: boolean }>;
  generateOrderNumber: () => string;
  maxAttempts?: number;
}): Promise<PersistedStoreOrder>;
