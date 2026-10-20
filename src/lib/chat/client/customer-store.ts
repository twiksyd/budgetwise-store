"use client";

import { useSyncExternalStore } from "react";
import { createConversationCache } from "@/lib/chat/conversation-cache.mjs";
import { createConversationLoader } from "@/lib/chat/conversation-loader.mjs";
import type { SummaryLine } from "@/lib/chat/order-summary.mjs";
import type { CustomerAssistant } from "@/lib/chat/assistant.mjs";
import type { CustomerSlot } from "@/components/order-chat/gamepass-link-card";
import { fetchJson, RequestError } from "@/lib/chat/client/fetch-json";

// The customer's side of the app keeps its data here, OUTSIDE any page
// component, the same way the admin inbox does: My Orders and every chat
// opened in this tab survive navigation, so Orders -> Chat -> Back -> Chat
// paints from memory at once and only refreshes in the background.
// Signing out reloads the page, which clears all of it.

type Cursor = { at: string | null; messageId: string | null };

export interface CustomerOrderSummaryData {
  /** "inquiry": the customer's General Inquiry (no items, total or payment). */
  kind?: "order" | "inquiry";
  orderNumber: string;
  conversationId: string | null;
  totalAmount: number;
  createdAt: string;
  buyerName: string;
  robloxUsername: string;
  status: string;
  state: "active" | "done";
  paymentSent: boolean;
  /** 0027: the most recently confirmed payment card (absent from older servers). */
  paymentReceivedMessageId?: string | null;
  itemCount: number;
  summary: string;
  lines: SummaryLine[];
}

/** Everything the chat shows besides the messages (GET .../summary). */
export interface CustomerChatDetails {
  readOnlyHome?: string | null;
  historySources?: { sourceKey: string; unread: number; firstUnreadId: string | null }[];
  summary: CustomerOrderSummaryData;
  adminRead: Cursor;
  ownRead: Cursor;
  slots: CustomerSlot[];
  orderCount?: number;
  /** Who is assisting (public username only); null = waiting for an assistant. */
  assistant?: CustomerAssistant | null;
  /** 0033: this order lives in the customer's conversation (its key). */
  movedTo?: string;
  /** This order continues on Messenger (m.me link with the order number). */
  messenger?: string | null;
  messengerMessage?: string;
  /** 0033 (the conversation): its orders, newest first. */
  orders?: ConversationOrder[];
  orderTotal?: number;
}

/** 0033: one order inside the customer's conversation. */
export interface ConversationOrder {
  orderNumber: string;
  createdAt: string;
  total: number;
  status: string;
  itemCount: number;
  summary: string;
  payment: "awaiting" | "sent" | "received";
  slots: CustomerSlot[];
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
  /** 0033: the chat this order lives in (absent from older servers = its own). */
  chatKey?: string;
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

async function customerFetch<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    return await fetchJson<T>(url, init);
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

// ---- General Inquiry: one per customer, created on first use (POST)
let inquiryKey: string | null = null;
let inquiryRequest: Promise<string> | null = null;

/** The signed-in customer's General Inquiry key (cached for the tab). */
export function openInquiry(): Promise<string> {
  if (inquiryKey) return Promise.resolve(inquiryKey);
  inquiryRequest ??= customerFetch<{ key: string }>("/api/account/inquiry", { method: "POST" })
    .then((body) => {
      inquiryKey = body.key;
      return body.key;
    })
    .finally(() => {
      inquiryRequest = null;
    });
  return inquiryRequest;
}

/** Already known (from the conversation list) — opening it needs no request. */
export function rememberInquiry(key: string | null) {
  if (key) inquiryKey = key;
}

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

export function hasOrdersSection(section: "open" | "completed") {
  return orders[section] !== null || ordersInFlight.has(section);
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
const MESSAGES_ENTRY = "/messages";
let previousPathname: string | null = null;
let currentPathname: string | null = null;
// /messages replaces itself with the chat it picks: remember what was before it.
let messagesOrigin: string | null = null;
export function recordPathname(pathname: string) {
  if (pathname === currentPathname) return;
  if (pathname === MESSAGES_ENTRY) messagesOrigin = currentPathname;
  previousPathname = currentPathname;
  currentPathname = pathname;
}
export function cameFrom() {
  return previousPathname;
}

// Pages Back must not return to from a chat (a finished checkout, sign-in,
// another chat, the /messages hop).
const NOT_A_BACK_TARGET = /^\/(orders\/|checkout|login|auth|messages)/;

/**
 * Back from a chat: true = history.back() to the in-app screen it was opened
 * from (instant, from memory); false = there is none, go to My Orders.
 */
export function chatBackReturns(): boolean {
  const from = previousPathname === MESSAGES_ENTRY ? messagesOrigin : previousPathname;
  return Boolean(from) && !NOT_A_BACK_TARGET.test(from as string);
}

