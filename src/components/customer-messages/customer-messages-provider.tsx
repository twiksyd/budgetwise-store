"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRealtimeChannel } from "@/lib/chat/client/use-realtime-channel";
import { fetchJson, RequestError } from "@/lib/chat/client/fetch-json";
import { pickConversation, relevantConversations } from "@/lib/chat/order-summary.mjs";

export interface CustomerConversation {
  conversationId: string;
  orderNumber: string;
  state: "active" | "done";
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderRole: "customer" | "admin" | null;
}

interface CustomerMessagesValue {
  /** null until we know; false for visitors who are not signed in. */
  signedIn: boolean | null;
  conversations: CustomerConversation[];
  /** Server-computed unread BudgetWise messages across all orders. */
  totalUnread: number;
  /** Bumped when realtime (or a read) says something changed — My Orders re-fetches then. */
  version: number;
  refresh: () => void;
  /** Opens the messenger panel (best conversation unless one is named). */
  openMessenger: (orderNumber?: string) => void;
  closeMessenger: () => void;
  messengerOrder: string | null;
  messengerOpen: boolean;
  pick: () => CustomerConversation | null;
  relevant: CustomerConversation[];
}

const CustomerMessagesContext = createContext<CustomerMessagesValue | null>(null);

export function useCustomerMessages() {
  return useContext(CustomerMessagesContext);
}

const EVENTS = ["message", "conversation"] as const;

/** Supabase keeps the session in a readable cookie; visitors without one skip the API call. */
function hasSessionCookie() {
  return typeof document !== "undefined" && /(?:^|;\s*)sb-[^=]+-auth-token/.test(document.cookie);
}

/**
 * The signed-in customer's conversations across ALL their orders, kept in
 * sync through one private realtime topic (customer:<their id>). Unread
 * counts always come from the server's read cursors — the client never
 * invents them; every event or read just triggers a (debounced) refresh.
 */
export function CustomerMessagesProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<CustomerConversation[]>([]);
  const [version, setVersion] = useState(0);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [messengerOrder, setMessengerOrder] = useState<string | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    if (!hasSessionCookie()) {
      setSignedIn(false);
      setConversations([]);
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        try {
          const body = await fetchJson<{ userId: string; conversations: CustomerConversation[] }>(
            "/api/account/conversations",
          );
          setUserId(body.userId);
          setConversations(body.conversations);
          setSignedIn(true);
        } catch (error) {
          if (error instanceof RequestError && error.status === 401) {
            setSignedIn(false);
            setUserId(null);
            setConversations([]);
          }
        }
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, []);

  const timer = useRef<number | undefined>(undefined);
  // A change was signalled (realtime event, a read, the tab coming back):
  // reload once, debounced, and let listeners (My Orders) know.
  const refresh = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void load();
      setVersion((value) => value + 1);
    }, 250);
  }, [load]);

  // First load, and again when sign-in state may have changed (navigation
  // after login/logout) or the tab comes back.
  useEffect(() => {
    void load();
  }, [load, pathname]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useRealtimeChannel({
    topic: userId && !pathname?.startsWith("/admin") ? `customer:${userId}` : null,
    events: EVENTS,
    onEvent: refresh,
    onResync: refresh,
  });

  const openMessenger = useCallback(
    (orderNumber?: string) => {
      const target = orderNumber ?? pickConversation(conversations)?.orderNumber ?? null;
      setMessengerOrder(target);
      setMessengerOpen(true);
    },
    [conversations],
  );
  const closeMessenger = useCallback(() => setMessengerOpen(false), []);

  const value = useMemo<CustomerMessagesValue>(
    () => ({
      signedIn,
      conversations,
      totalUnread: conversations.reduce((sum, row) => sum + row.unreadCount, 0),
      version,
      refresh,
      openMessenger,
      closeMessenger,
      messengerOrder,
      messengerOpen,
      pick: () => pickConversation(conversations),
      relevant: relevantConversations(conversations),
    }),
    [signedIn, conversations, version, refresh, openMessenger, closeMessenger, messengerOrder, messengerOpen],
  );

  return <CustomerMessagesContext.Provider value={value}>{children}</CustomerMessagesContext.Provider>;
}
