"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRealtimeChannel } from "@/lib/chat/client/use-realtime-channel";
import { fetchJson, RequestError } from "@/lib/chat/client/fetch-json";
import { hasSessionCookie, recordPathname } from "@/lib/chat/client/customer-store";
import { debugLog } from "@/lib/chat/client/debug";
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
  email: string | null;
  conversations: CustomerConversation[];
  /** Server-computed unread BudgetWise messages across all orders. */
  totalUnread: number;
  /** Bumped when realtime (or a read) says something changed — My Orders re-fetches then. */
  version: number;
  refresh: () => void;
  pick: () => CustomerConversation | null;
  relevant: CustomerConversation[];
}

const CustomerMessagesContext = createContext<CustomerMessagesValue | null>(null);

export function useCustomerMessages() {
  return useContext(CustomerMessagesContext);
}

const EVENTS = ["message", "conversation"] as const;

// Navigation alone does not change unread counts (realtime and reads do);
// it only re-checks the list when the last check is older than this.
const NAVIGATION_RECHECK_MS = 60_000;

/**
 * The signed-in customer's conversations across ALL their orders, kept in
 * sync through one private realtime topic (customer:<their id>). Unread
 * counts always come from the server's read cursors — the client never
 * invents them; every event or read just triggers a (debounced) refresh.
 *
 * Mounted once for the whole storefront: its realtime channel lives across
 * route changes.
 */
export function CustomerMessagesProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [conversations, setConversations] = useState<CustomerConversation[]>([]);
  const [version, setVersion] = useState(0);
  const inFlight = useRef(false);
  const again = useRef(false);
  const loadedAt = useRef(0);

  const load = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    if (!hasSessionCookie()) {
      setSignedIn(false);
      setUserId(null);
      setConversations([]);
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        try {
          const body = await fetchJson<{ userId: string; email: string | null; conversations: CustomerConversation[] }>(
            "/api/account/conversations",
          );
          loadedAt.current = Date.now();
          setUserId(body.userId);
          setEmail(body.email ?? null);
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

  // First load; afterwards a navigation only re-checks when the session
  // cookie appeared/disappeared or the last check is old. Never a request
  // competing with every tap.
  const hadCookie = useRef<boolean | null>(null);
  useEffect(() => {
    // Diagnostics only (off unless bw:debug is set): taps and full page loads.
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    debugLog("nav", "document load", navigation?.type, location.pathname);
    const onTap = (event: PointerEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href], button");
      if (link) debugLog("nav", "tap", link.getAttribute("href") ?? link.getAttribute("aria-label") ?? link.textContent?.slice(0, 30));
    };
    document.addEventListener("pointerdown", onTap, { capture: true });
    return () => document.removeEventListener("pointerdown", onTap, { capture: true });
  }, []);
  useEffect(() => {
    debugLog("nav", "pathname", pathname);
    if (pathname) recordPathname(pathname);
    const cookie = hasSessionCookie();
    const changed = hadCookie.current !== cookie;
    hadCookie.current = cookie;
    if (changed || (cookie && Date.now() - loadedAt.current > NAVIGATION_RECHECK_MS)) void load();
  }, [load, pathname]);
  // Coming back to the tab is handled by the realtime hook below: it calls
  // onResync (refresh) once, and only after a real absence.

  useRealtimeChannel({
    topic: userId && !pathname?.startsWith("/admin") ? `customer:${userId}` : null,
    events: EVENTS,
    onEvent: refresh,
    onResync: refresh,
  });

  const value = useMemo<CustomerMessagesValue>(
    () => ({
      signedIn,
      email,
      conversations,
      totalUnread: conversations.reduce((sum, row) => sum + row.unreadCount, 0),
      version,
      refresh,
      pick: () => pickConversation(conversations),
      relevant: relevantConversations(conversations),
    }),
    [signedIn, email, conversations, version, refresh],
  );

  return <CustomerMessagesContext.Provider value={value}>{children}</CustomerMessagesContext.Provider>;
}
