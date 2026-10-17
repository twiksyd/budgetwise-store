"use client";

import { useSyncExternalStore } from "react";
import { createConversationCache } from "@/lib/chat/conversation-cache.mjs";
import { createConversationLoader } from "@/lib/chat/conversation-loader.mjs";
import type { SummaryLine } from "@/lib/chat/order-summary.mjs";
import type { CustomerSlot } from "@/components/order-chat/gamepass-link-card";
import { fetchJson, RequestError } from "@/lib/chat/client/fetch-json";

// The customer's side of the app keeps its data here, OUTSIDE any page
// component, the same way the admin inbox does: My Orders and every chat
// opened in this tab survive navigation, so Orders -> Chat -> Back -> Chat
// paints from memory at once and only refreshes in the background.
// Signing out reloads the page, which clears all of it.

type Cursor = { at: string | null; messageId: string | null };

export interface CustomerOrderSummaryData {
  orderNumber: string;
  conversationId: string | null;
  totalAmount: number;
  createdAt: string;
  buyerName: string;
  robloxUsername: string;
  status: string;
  state: "active" | "done";
  paymentSent: boolean;
  itemCount: number;
  summary: string;
  lines: SummaryLine[];
}

/** Everything the chat shows besides the messages (GET .../summary). */
export interface CustomerChatDetails {
  summary: CustomerOrderSummaryData;
  adminRead: Cursor;
  ownRead: Cursor;
  slots: CustomerSlot[];
  orderCount?: number;
}

export interface MyOrderCard {
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  robloxUsername: string;
  status: string;
  state: "active" | "done";
  doneAt: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderRole: "customer" | "admin" | null;
  paymentSent: boolean;
  summary: string;
  thumbnails: string[];
}
export type OrdersCursor = { at: string; orderNumber: string } | null;
export type OrdersSection = { rows: MyOrderCard[]; nextCursor: OrdersCursor };

/** Supabase keeps the session in a readable cookie; visitors without one skip the API calls. */
export function hasSessionCookie() {
  return typeof document !== "undefined" && /(?:^|;\s*)sb-[^=]+-auth-token/.test(document.cookie);
}

export function loginPath() {
  const here = typeof window === "undefined" ? "/account/orders" : window.location.pathname + window.location.search;
  return `/login?next=${encodeURIComponent(here)}`;
}

// ---- tiny external store helper
function createSignal() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of listeners) listener();
    },
  };
}

// ---- requests: a signed-out session goes to login; a 404 marks the order missing
const missingSignal = createSignal();
const missing = new Set<string>();

async function customerFetch<T>(url: string): Promise<T> {
  try {
    return await fetchJson<T>(url);
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) window.location.assign(loginPath());
    if (error instanceof RequestError && error.status === 404) {
      const match = /\/api\/order-chat\/([^/?]+)/.exec(url);
      if (match) {
        missing.add(decodeURIComponent(match[1]));
        missingSignal.emit();
      }
    }
    throw error;
  }
}

export function useOrderMissing(orderNumber: string) {
  return useSyncExternalStore(
    missingSignal.subscribe,
    () => missing.has(orderNumber),
    () => false,
  );
}

// ---- chats: PR #3's conversation cache + loader, customer flavour
export const customerChatCache = createConversationCache<CustomerChatDetails>({ limit: 12 });
export const customerChatLoader = createConversationLoader<CustomerChatDetails>({
  cache: customerChatCache,
  fetchJson: customerFetch,
  viewer: "customer",
  detailsUrl: (orderNumber) => `/api/order-chat/${encodeURIComponent(orderNumber)}/summary`,
  pickDetails: (body) => body as CustomerChatDetails,
});

/**
 * The newest message whose read receipt was sent (or is on its way) per
 * order: reopening a chat never re-sends the same receipt, even while the
 * first one is still in flight.
 */
export const readReceipts = new Map<string, string>();

/** Touch / hover on a chat link: start loading before the tap completes. */
export function warmChat(orderNumber: string) {
  if (!customerChatCache.has(orderNumber)) customerChatCache.touch(orderNumber);
  customerChatLoader.prefetchNow(orderNumber);
}

// ---- My Orders: active and completed load independently
interface OrdersState {
  open: OrdersSection | null;
  completed: OrdersSection | null;
  openError: boolean;
  completedError: boolean;
}
const ordersSignal = createSignal();
let orders: OrdersState = { open: null, completed: null, openError: false, completedError: false };
const ordersInFlight = new Map<"open" | "completed", Promise<void>>();

function setOrders(patch: Partial<OrdersState>) {
  orders = { ...orders, ...patch };
  ordersSignal.emit();
}

export function useMyOrders() {
  return useSyncExternalStore(
    ordersSignal.subscribe,
    () => orders,
    () => orders,
  );
}

/** Fresh first page of one section; any older completed pages already loaded are kept. */
export function loadOrdersSection(section: "open" | "completed") {
  const running = ordersInFlight.get(section);
  if (running) return running;
  const promise = customerFetch<OrdersSection>(`/api/account/orders?section=${section}`)
    .then((body) => {
      if (section === "open") {
        setOrders({ open: body, openError: false });
        return;
      }
      const fresh = new Set(body.rows.map((row) => row.orderNumber));
      const reopened = new Set((orders.open?.rows ?? []).map((row) => row.orderNumber));
      const older = (orders.completed?.rows ?? []).filter(
        (row) => !fresh.has(row.orderNumber) && !reopened.has(row.orderNumber),
      );
      const keepOlder = orders.completed && orders.completed.rows.length > body.rows.length;
      setOrders({
        completed: {
          rows: keepOlder ? [...body.rows, ...older] : body.rows,
          nextCursor: keepOlder ? orders.completed!.nextCursor : body.nextCursor,
        },
        completedError: false,
      });
    })
    .catch(() => {
      setOrders(section === "open" ? { openError: true } : { completedError: true });
    })
    .finally(() => ordersInFlight.delete(section));
  ordersInFlight.set(section, promise);
  return promise;
}

export async function loadOlderCompleted() {
  const cursor = orders.completed?.nextCursor;
  if (!cursor) return;
  const params = new URLSearchParams({ section: "completed", beforeAt: cursor.at, beforeOrder: cursor.orderNumber });
  const body = await customerFetch<OrdersSection>(`/api/account/orders?${params}`);
  const current = orders.completed?.rows ?? [];
  const seen = new Set(current.map((row) => row.orderNumber));
  setOrders({
    completed: { rows: [...current, ...body.rows.filter((row) => !seen.has(row.orderNumber))], nextCursor: body.nextCursor },
  });
}

// ---- in-app history: Back can return to the previous screen instantly
let previousPathname: string | null = null;
let currentPathname: string | null = null;
export function recordPathname(pathname: string) {
  if (pathname === currentPathname) return;
  previousPathname = currentPathname;
  currentPathname = pathname;
}
export function cameFrom() {
  return previousPathname;
}

