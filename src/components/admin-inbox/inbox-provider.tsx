"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  createInboxState,
  inboxReducer,
  type InboxAction,
  type InboxConversationEvent,
  type InboxCursor,
  type InboxMessageEvent,
  type InboxReadEvent,
  type InboxRow,
  type InboxState,
  type InboxView,
} from "@/lib/chat/inbox-state.mjs";
import {
  applySignal,
  emptyPresence,
  prunePresence,
  type PresenceState,
} from "@/lib/chat/presence-state.mjs";
import type { QuickReplyItem } from "@/lib/chat/quick-reply-menu.mjs";
import type { SignalType } from "@/lib/chat/signals.mjs";
import type { ConnectionStatus } from "@/lib/chat/connection-state.mjs";
import { useRealtimeChannel } from "@/lib/chat/client/use-realtime-channel";
import { fetchJson, jsonInit } from "@/lib/chat/client/fetch-json";
import { createConversationCache, type ConversationCache } from "@/lib/chat/conversation-cache.mjs";
import { createConversationLoader, type ConversationLoader } from "@/lib/chat/conversation-loader.mjs";
import type { OrderDetails } from "@/lib/chat/order-details.mjs";
import { isValidOrderNumber } from "@/lib/order-chat.mjs";
import { gamesParam } from "@/lib/chat/inbox-games.mjs";

export interface DirectoryEntry {
  userId: string;
  displayName: string;
  publicUsername?: string | null;
  email: string | null;
}

export interface ActivePaymentMethod {
  id: string;
  provider: "gcash";
  label: string;
  accountName: string;
  accountNumber: string;
  hasQr: boolean;
}

type Listener = (event: string, payload: Record<string, unknown>) => void;

interface InboxContextValue {
  me: string;
  directory: Record<string, DirectoryEntry>;
  directoryList: DirectoryEntry[];
  inbox: InboxState;
  dispatch: (action: InboxAction) => void;
  status: ConnectionStatus;
  presence: PresenceState;
  nowMs: number;
  quickReplies: QuickReplyItem[];
  paymentMethods: ActivePaymentMethod[];
  view: InboxView;
  /** persist: also save the game filter as this admin's preference (0029). */
  setView: (view: InboxView, options?: { persist?: boolean }) => void;
  /** 0029: catalog games for the filter, and urgent chats the filter hides. */
  games: InboxGameOption[];
  outsideNeedsReply: number;
  loadingPage: boolean;
  loadMore: () => void;
  /** The open conversation reports itself here (for unread counting). */
  activeRef: React.MutableRefObject<{ orderNumber: string | null; isRead: boolean }>;
  subscribe: (listener: Listener) => () => void;
  sendSignal: (type: SignalType, orderNumber: string, options?: { beacon?: boolean }) => void;
  /** Conversations opened or prefetched: thread + order details, keyed by order. */
  cache: ConversationCache<OrderDetails>;
  loader: ConversationLoader;
  /** The open conversation (client state; the URL follows it). */
  activeOrderNumber: string | null;
  select: (orderNumber: string | null, options?: { focusComposer?: boolean }) => void;
  /** True once per selection that asked for the composer to be focused. */
  takeFocusRequest: (orderNumber: string) => boolean;
}

const INBOX_PATH = "/admin/orders";

export function orderFromPath(pathname: string | null): string | null {
  const match = /^\/admin\/orders\/([^/]+)\/?$/.exec(pathname ?? "");
  if (!match) return null;
  let orderNumber: string;
  try {
    orderNumber = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isValidOrderNumber(orderNumber) ? orderNumber : null;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function useInbox() {
  const value = useContext(InboxContext);
  if (!value) throw new Error("useInbox must be used inside InboxProvider");
  return value;
}

// Hidden-urgent count (0029): re-read at most this often after activity.
const OUTSIDE_RECOUNT_MS = 1500;

const EVENTS = ["message", "conversation", "read", "signal", "quick_replies", "fulfillment"] as const;

export interface InboxGameOption {
  id: string;
  name: string;
}

export function InboxProvider({
  me,
  directory: directoryList,
  initialPage,
  initialPreferences = { games: null, includeInquiries: true },
  games = [],
  initialQuickReplies,
  paymentMethods,
  children,
}: {
  me: string;
  directory: DirectoryEntry[];
  initialPage: { rows: InboxRow[]; hasMore: boolean; nextCursor: InboxCursor | null; outsideNeedsReply?: number };
  initialPreferences?: { games: string[] | null; includeInquiries: boolean };
  games?: InboxGameOption[];
  initialQuickReplies: QuickReplyItem[];
  paymentMethods: ActivePaymentMethod[];
  children: React.ReactNode;
}) {
  const initialView: InboxView = {
    filter: "active",
    search: "",
    games: initialPreferences.games,
    includeInquiries: initialPreferences.includeInquiries,
  };
  const [inbox, dispatch] = useReducer(inboxReducer, undefined, () =>
    createInboxState({ me, rows: initialPage.rows, hasMore: initialPage.hasMore, nextCursor: initialPage.nextCursor, view: initialView }),
  );
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;

  const [presence, setPresence] = useState<PresenceState>(emptyPresence);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [quickReplies, setQuickReplies] = useState(initialQuickReplies);
  const [view, setViewState] = useState<InboxView>(initialView);
  const [outsideNeedsReply, setOutsideNeedsReply] = useState(initialPage.outsideNeedsReply ?? 0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [loadingPage, setLoadingPage] = useState(false);
  const activeRef = useRef<{ orderNumber: string | null; isRead: boolean }>({ orderNumber: null, isRead: false });
  const listeners = useRef(new Set<Listener>());

  const directory = useMemo(
    () => Object.fromEntries(directoryList.map((entry) => [entry.userId, entry])),
    [directoryList],
  );

  // Clock for presence expiry and list times. Instead of re-rendering every
  // row and the open thread every 2 s, it advances exactly when something
  // on screen can change: the next viewing/typing expiry, or each minute.
  useEffect(() => {
    const now = Date.now();
    let next = Infinity;
    for (const entry of Object.values(presence)) {
      for (const until of [entry.viewingUntil, entry.typingUntil]) {
        if (until > now && until < next) next = until;
      }
    }
    if (next === Infinity) return;
    const timer = window.setTimeout(() => {
      const at = Date.now();
      setNowMs(at);
      setPresence((current) => prunePresence(current, at));
    }, next - now + 50);
    return () => window.clearTimeout(timer);
  }, [presence, nowMs]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // ---- conversation cache + client-side selection
  const [{ cache, loader }] = useState(() => {
    const created = createConversationCache<OrderDetails>();
    return {
      cache: created,
      loader: createConversationLoader<OrderDetails>({ cache: created, fetchJson, viewer: "admin" }),
    };
  });
  const pathname = usePathname();
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(() => orderFromPath(pathname));
  const focusRequest = useRef<string | null>(null);
  const activeOrderRef = useRef(activeOrderNumber);
  activeOrderRef.current = activeOrderNumber;

  const select = useCallback(
    (orderNumber: string | null, options?: { focusComposer?: boolean }) => {
      activeRef.current = {
        orderNumber,
        isRead: orderNumber ? document.visibilityState === "visible" : false,
      };
      focusRequest.current = orderNumber && options?.focusComposer ? orderNumber : null;
      if (orderNumber) loader.open(orderNumber);
      else cache.pin(null);
      activeOrderRef.current = orderNumber;
      setActiveOrderNumber(orderNumber);
      // Client-side only: no server round trip. Next.js keeps usePathname in
      // sync with history.pushState, and a reload/deep link still works.
      const url = orderNumber ? `${INBOX_PATH}/${encodeURIComponent(orderNumber)}` : INBOX_PATH;
      if (window.location.pathname !== url) window.history.pushState(null, "", url);
    },
    [cache, loader],
  );

  const takeFocusRequest = useCallback((orderNumber: string) => {
    if (focusRequest.current !== orderNumber) return false;
    focusRequest.current = null;
    return true;
  }, []);

  // Back/forward (and any other navigation) — the address bar is the truth.
  useEffect(() => {
    const sync = () => {
      const fromUrl = orderFromPath(window.location.pathname);
      if (fromUrl === activeOrderRef.current) return;
      activeOrderRef.current = fromUrl;
      activeRef.current = { orderNumber: fromUrl, isRead: Boolean(fromUrl) && document.visibilityState === "visible" };
      if (fromUrl) loader.open(fromUrl);
      else cache.pin(null);
      setActiveOrderNumber(fromUrl);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [pathname, cache, loader]);

  // Deep link / reload straight into a conversation.
  const openedOnMount = useRef(false);
  useEffect(() => {
    if (openedOnMount.current) return;
    openedOnMount.current = true;
    if (activeOrderNumber) {
      activeRef.current = { orderNumber: activeOrderNumber, isRead: document.visibilityState === "visible" };
      loader.open(activeOrderNumber);
    }
  }, [activeOrderNumber, loader]);

  // ---- inbox pages (filter/search/pagination). Never on every message.
  const requestSeq = useRef(0);
  const loadPage = useCallback(async (nextView: InboxView, cursor: InboxCursor | null) => {
    const seq = ++requestSeq.current;
    setLoadingPage(true);
    const params = new URLSearchParams({
      filter: nextView.filter,
      search: nextView.search,
      games: gamesParam(nextView.games),
      inquiries: nextView.includeInquiries === false ? "0" : "1",
    });
    if (cursor) {
      params.set("beforeAt", cursor.at);
      params.set("beforeOrder", cursor.orderNumber);
    }
    try {
      const page = await fetchJson<{ rows: InboxRow[]; hasMore: boolean; nextCursor: InboxCursor | null; outsideNeedsReply?: number }>(
        `/api/admin/inbox?${params}`,
      );
      if (seq !== requestSeq.current) return;
      if (typeof page.outsideNeedsReply === "number") setOutsideNeedsReply(page.outsideNeedsReply);
      dispatch(
        cursor
          ? { type: "append", ...page }
          : { type: "reset", ...page, view: nextView },
      );
    } catch {
      // Keep what is on screen; the next resync tries again.
    } finally {
      if (seq === requestSeq.current) setLoadingPage(false);
    }
  }, []);

  const searchTimer = useRef<number | undefined>(undefined);
  const setView = useCallback(
    (next: InboxView, options?: { persist?: boolean }) => {
      if (options?.persist) {
        // The admin's own preference; the server takes the id from the session.
        void fetchJson("/api/admin/inbox/preferences", jsonInit("PUT", {
          games: next.games ?? null,
          includeInquiries: next.includeInquiries !== false,
        })).catch(() => undefined);
      }
      setViewState(next);
      window.clearTimeout(searchTimer.current);
      const delay = next.search !== viewRef.current.search ? 300 : 0;
      searchTimer.current = window.setTimeout(() => void loadPage(next, null), delay);
    },
    [loadPage],
  );

  const loadMore = useCallback(() => {
    const current = inboxRef.current;
    if (!current.hasMore || !current.nextCursor) return;
    void loadPage(viewRef.current, current.nextCursor);
  }, [loadPage]);

  // ---- single-row fetches for new/stale conversations
  const fetchingRows = useRef(new Set<string>());
  useEffect(() => {
    for (const orderNumber of inbox.stale) {
      if (fetchingRows.current.has(orderNumber)) continue;
      fetchingRows.current.add(orderNumber);
      void fetchJson<{ row: InboxRow }>(`/api/admin/inbox/${encodeURIComponent(orderNumber)}`)
        .then(({ row }) =>
          dispatch({ type: "upsert_row", row, activeOrderNumber: activeRef.current.orderNumber }),
        )
        .catch(() => undefined)
        .finally(() => fetchingRows.current.delete(orderNumber));
    }
  }, [inbox.stale]);

  // ---- realtime
  const emit = useCallback((event: string, payload: Record<string, unknown>) => {
    for (const listener of listeners.current) listener(event, payload);
  }, []);

  const outsideTimer = useRef<number | undefined>(undefined);
  const refreshOutside = useCallback(() => {
    const current = viewRef.current;
    if (!Array.isArray(current.games)) return;
    window.clearTimeout(outsideTimer.current);
    outsideTimer.current = window.setTimeout(() => {
      const params = new URLSearchParams({ games: gamesParam(current.games), inquiries: current.includeInquiries === false ? "0" : "1" });
      void fetchJson<{ count: number }>(`/api/admin/inbox/outside?${params}`)
        .then(({ count }) => setOutsideNeedsReply(count))
        .catch(() => undefined);
    }, OUTSIDE_RECOUNT_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(outsideTimer.current), []);

  const onEvent = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      const active = activeRef.current;
      const orderNumber = typeof payload.order_number === "string" ? payload.order_number : null;
      switch (event) {
        case "message":
          dispatch({
            type: "message_event",
            event: payload as unknown as InboxMessageEvent,
            activeOrderNumber: active.orderNumber,
            activeIsRead: active.isRead,
          });
          // Any cached thread (open or not) pulls just the new message(s);
          // one still loading its first page gets a follow-up delta.
          if (orderNumber && cache.has(orderNumber)) void loader.fetchNewer(orderNumber);
          refreshOutside();
          break;
        case "fulfillment":
          if (orderNumber && orderNumber === active.orderNumber) void loader.ensureDetails(orderNumber, { force: true });
          else if (orderNumber) cache.markDetailsStale(orderNumber);
          break;
        case "conversation":
          dispatch({
            type: "conversation_event",
            event: payload as unknown as InboxConversationEvent,
            activeOrderNumber: active.orderNumber,
          });
          break;
        case "read":
          dispatch({ type: "read_event", event: payload as unknown as InboxReadEvent });
          break;
        case "signal":
          setPresence((current) =>
            applySignal(current, payload as { type: string; admin_user_id: string; order_number: string }, Date.now()),
          );
          return;
        case "quick_replies":
          void fetchJson<{ replies: QuickReplyItem[] }>("/api/admin/quick-replies")
            .then(({ replies }) => setQuickReplies(replies))
            .catch(() => undefined);
          return;
      }
      emit(event, payload);
    },
    [emit, cache, loader, refreshOutside],
  );

  const onResync = useCallback(() => {
    void loadPage(viewRef.current, null);
    // Missed events: everything cached refreshes when next opened; the open
    // conversation refreshes now (delta only).
    cache.markAllStale();
    const open = activeRef.current.orderNumber;
    if (open) {
      void loader.fetchNewer(open);
      void loader.ensureDetails(open, { force: true });
    }
    emit("resync", {});
  }, [loadPage, emit, cache, loader]);

  const status = useRealtimeChannel({ topic: "admin:inbox", events: EVENTS, onEvent, onResync });

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  // Signals go through the server, which stamps them with MY session id.
  const sendSignal = useCallback(
    (type: SignalType, orderNumber: string, options?: { beacon?: boolean }) => {
      const body = JSON.stringify({ type, orderNumber });
      if (options?.beacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/admin/inbox/signal", body);
        return;
      }
      void fetch("/api/admin/inbox/signal", { ...jsonInit("POST", { type, orderNumber }), keepalive: true }).catch(
        () => undefined,
      );
    },
    [],
  );

  const value: InboxContextValue = {
    me,
    directory,
    directoryList,
    inbox,
    dispatch,
    status,
    presence,
    nowMs,
    quickReplies,
    paymentMethods,
    view,
    setView,
    games,
    outsideNeedsReply,
    loadingPage,
    loadMore,
    activeRef,
    subscribe,
    sendSignal,
    cache,
    loader,
    activeOrderNumber,
    select,
    takeFocusRequest,
  };

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}
