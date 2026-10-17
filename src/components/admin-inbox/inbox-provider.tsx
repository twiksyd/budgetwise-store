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

export interface DirectoryEntry {
  userId: string;
  displayName: string;
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
  setView: (view: InboxView) => void;
  loadingPage: boolean;
  loadMore: () => void;
  /** The open conversation reports itself here (for unread counting). */
  activeRef: React.MutableRefObject<{ orderNumber: string | null; isRead: boolean }>;
  subscribe: (listener: Listener) => () => void;
  sendSignal: (type: SignalType, orderNumber: string, options?: { beacon?: boolean }) => void;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function useInbox() {
  const value = useContext(InboxContext);
  if (!value) throw new Error("useInbox must be used inside InboxProvider");
  return value;
}

const EVENTS = ["message", "conversation", "read", "signal", "quick_replies", "fulfillment"] as const;

export function InboxProvider({
  me,
  directory: directoryList,
  initialPage,
  initialQuickReplies,
  paymentMethods,
  children,
}: {
  me: string;
  directory: DirectoryEntry[];
  initialPage: { rows: InboxRow[]; hasMore: boolean; nextCursor: InboxCursor | null };
  initialQuickReplies: QuickReplyItem[];
  paymentMethods: ActivePaymentMethod[];
  children: React.ReactNode;
}) {
  const [inbox, dispatch] = useReducer(inboxReducer, undefined, () =>
    createInboxState({ me, ...initialPage }),
  );
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;

  const [presence, setPresence] = useState<PresenceState>(emptyPresence);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [quickReplies, setQuickReplies] = useState(initialQuickReplies);
  const [view, setViewState] = useState<InboxView>({ filter: "all", search: "" });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [loadingPage, setLoadingPage] = useState(false);
  const activeRef = useRef<{ orderNumber: string | null; isRead: boolean }>({ orderNumber: null, isRead: false });
  const listeners = useRef(new Set<Listener>());

  const directory = useMemo(
    () => Object.fromEntries(directoryList.map((entry) => [entry.userId, entry])),
    [directoryList],
  );

  // Presence expiry tick.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      setPresence((current) => prunePresence(current, now));
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  // ---- inbox pages (filter/search/pagination). Never on every message.
  const requestSeq = useRef(0);
  const loadPage = useCallback(async (nextView: InboxView, cursor: InboxCursor | null) => {
    const seq = ++requestSeq.current;
    setLoadingPage(true);
    const params = new URLSearchParams({ filter: nextView.filter, search: nextView.search });
    if (cursor) {
      params.set("beforeAt", cursor.at);
      params.set("beforeOrder", cursor.orderNumber);
    }
    try {
      const page = await fetchJson<{ rows: InboxRow[]; hasMore: boolean; nextCursor: InboxCursor | null }>(
        `/api/admin/inbox?${params}`,
      );
      if (seq !== requestSeq.current) return;
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
    (next: InboxView) => {
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

  const onEvent = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      const active = activeRef.current;
      switch (event) {
        case "message":
          dispatch({
            type: "message_event",
            event: payload as unknown as InboxMessageEvent,
            activeOrderNumber: active.orderNumber,
            activeIsRead: active.isRead,
          });
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
    [emit],
  );

  const onResync = useCallback(() => {
    void loadPage(viewRef.current, null);
    emit("resync", {});
  }, [loadPage, emit]);

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
    loadingPage,
    loadMore,
    activeRef,
    subscribe,
    sendSignal,
  };

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}
