"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  deriveConnectionStatus,
  pollIntervalFor,
  reconnectDelay,
  shouldResync,
  type ConnectionStatus,
} from "@/lib/chat/connection-state.mjs";

// How long a private channel stays joined after its last subscriber leaves.
// Orders -> Chat -> Back -> Chat inside this window reuses the live channel
// instead of leaving and re-joining (and re-running the join's RLS check).
const LINGER_MS = 30_000;
// Coming back to the tab after at least this long fetches what may have been missed.
export const RESYNC_AFTER_HIDDEN_MS = 5_000;
// A join that has not answered in this long is treated as dead.
const JOIN_STUCK_MS = 10_000;

type Handler = (event: string, payload: Record<string, unknown>) => void;

interface Subscriber {
  events: Set<string>;
  onEvent: Handler;
}

interface Entry {
  topic: string;
  channel: RealtimeChannel | null;
  bound: Set<string>;
  subscribers: Set<Subscriber>;
  state: string | null;
  wasLive: boolean;
  failed: boolean;
  /** An event arrived while no component was subscribed. */
  missed: boolean;
  attempt: number;
  restartedAt: number;
  connectedAt: number;
  retryTimer: number | undefined;
  lingerTimer: number | undefined;
  version: number;
  listeners: Set<() => void>;
}

/**
 * One channel per topic for the whole tab, shared by every component that
 * listens to it and kept for LINGER_MS after the last one unmounts. Route
 * changes and re-renders never tear a channel down; only a real failure
 * (CLOSED / CHANNEL_ERROR / TIMED_OUT) re-creates it, with backoff.
 */
const entries = new Map<string, Entry>();

function notify(entry: Entry) {
  entry.version += 1;
  for (const listener of entry.listeners) listener();
}

function bind(entry: Entry, event: string) {
  if (!entry.channel || entry.bound.has(event)) return;
  entry.bound.add(event);
  entry.channel.on("broadcast", { event }, (message) => {
    // Lingering with nobody listening: the next subscriber has to catch up.
    if (entry.subscribers.size === 0) entry.missed = true;
    const payload = (message.payload ?? {}) as Record<string, unknown>;
    for (const subscriber of entry.subscribers) {
      if (subscriber.events.has(event)) subscriber.onEvent(event, payload);
    }
  });
}

function connect(entry: Entry) {
  const supabase = createClient();
  const channel = supabase.channel(entry.topic, { config: { private: true } });
  entry.channel = channel;
  entry.bound = new Set();
  for (const subscriber of entry.subscribers) for (const event of subscriber.events) bind(entry, event);

  entry.connectedAt = Date.now();
  void (async () => {
    // Private channels are authorised with the user's JWT.
    await supabase.realtime.setAuth();
    if (entry.channel !== channel) return;
    channel.subscribe((status) => {
      if (entry.channel !== channel) return;
      entry.state = status;
      if (status === "SUBSCRIBED") {
        entry.attempt = 0;
        entry.wasLive = true;
        entry.failed = false;
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        entry.failed = true;
        window.clearTimeout(entry.retryTimer);
        entry.retryTimer = window.setTimeout(() => restart(entry), reconnectDelay(entry.attempt++));
      }
      notify(entry);
    });
  })();
}

function isDead(entry: Entry) {
  if (entry.state === "SUBSCRIBED") return false;
  if (entry.state === "CLOSED" || entry.state === "CHANNEL_ERROR" || entry.state === "TIMED_OUT") return true;
  return Date.now() - entry.connectedAt > JOIN_STUCK_MS;
}

function teardown(entry: Entry) {
  window.clearTimeout(entry.retryTimer);
  const channel = entry.channel;
  entry.channel = null;
  entry.state = null;
  if (channel) void createClient().removeChannel(channel);
}

function restart(entry: Entry) {
  if (entries.get(entry.topic) !== entry) return;
  entry.restartedAt = Date.now();
  teardown(entry);
  connect(entry);
  notify(entry);
}

function acquire(topic: string, subscriber: Subscriber) {
  let entry = entries.get(topic);
  // Re-attaching after events (or a drop) nobody was listening for: catch up.
  const missedSomething = Boolean(
    entry && entry.subscribers.size === 0 && (entry.missed || entry.state !== "SUBSCRIBED"),
  );
  if (entry) entry.missed = false;
  if (!entry) {
    entry = {
      topic,
      channel: null,
      bound: new Set(),
      subscribers: new Set(),
      state: null,
      wasLive: false,
      failed: false,
      missed: false,
      attempt: 0,
      restartedAt: 0,
      connectedAt: 0,
      retryTimer: undefined,
      lingerTimer: undefined,
      version: 0,
      listeners: new Set(),
    };
    entries.set(topic, entry);
    entry.subscribers.add(subscriber);
    connect(entry);
  } else {
    window.clearTimeout(entry.lingerTimer);
    entry.subscribers.add(subscriber);
    for (const event of subscriber.events) bind(entry, event);
  }
  return { entry, missedSomething };
}

function release(entry: Entry, subscriber: Subscriber) {
  entry.subscribers.delete(subscriber);
  if (entry.subscribers.size > 0) return;
  window.clearTimeout(entry.lingerTimer);
  entry.lingerTimer = window.setTimeout(() => {
    if (entry.subscribers.size > 0 || entries.get(entry.topic) !== entry) return;
    entries.delete(entry.topic);
    teardown(entry);
  }, LINGER_MS);
}

/**
 * Subscribes to ONE private broadcast topic for the lifetime of the
 * component. Reports the real connection state (never "live" unless the
 * channel is actually SUBSCRIBED), re-creates dead channels with backoff,
 * and calls onResync whenever events may have been missed: after a
 * reconnect, when re-attaching to a channel that got events (or dropped)
 * while nobody was listening, when
 * the tab becomes visible again, and on a polling interval while realtime
 * is down.
 */
export function useRealtimeChannel({
  topic,
  events,
  onEvent,
  onResync,
}: {
  topic: string | null;
  events: readonly string[];
  onEvent: (event: string, payload: Record<string, unknown>) => void;
  onResync: () => void;
}): ConnectionStatus {
  const [online, setOnline] = useState(true);
  const [entry, setEntry] = useState<Entry | null>(null);
  const handlers = useRef({ onEvent, onResync });
  handlers.current = { onEvent, onResync };
  const eventsKey = events.join(",");

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!topic) {
      setEntry(null);
      return;
    }
    const subscriber: Subscriber = {
      events: new Set(eventsKey.split(",")),
      onEvent: (event, payload) => handlers.current.onEvent(event, payload),
    };
    const acquired = acquire(topic, subscriber);
    setEntry(acquired.entry);
    if (acquired.missedSomething) handlers.current.onResync();
    return () => release(acquired.entry, subscriber);
  }, [topic, eventsKey]);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!entry) return () => undefined;
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [entry],
  );
  const getVersion = useCallback(() => entry?.version ?? -1, [entry]);
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const status = deriveConnectionStatus({
    online,
    channelState: entry?.state ?? null,
    hasTopic: Boolean(topic && entry),
    wasLive: entry?.wasLive ?? false,
    failedBefore: entry?.failed ?? false,
  });

  // Fetch what was missed when coming back to live.
  const previous = useRef<ConnectionStatus>(status);
  const hasConnected = useRef(false);
  useEffect(() => {
    if (
      shouldResync({
        previous: previous.current,
        next: status,
        hasConnectedBefore: hasConnected.current,
      })
    ) {
      handlers.current.onResync();
    }
    if (status === "live") hasConnected.current = true;
    previous.current = status;
  }, [status]);

  // Phone/laptop waking up: resync if the page was really away (phones
  // flip visibility constantly — notification shade, app switcher), and
  // force a fresh channel only if it actually died. A join still in
  // progress is left alone: restarting it is what kept it from going live.
  const entryRef = useRef(entry);
  entryRef.current = entry;
  useEffect(() => {
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
    function onVisible() {
      if (document.visibilityState !== "visible") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      const current = entryRef.current;
      const live = current?.state === "SUBSCRIBED";
      if (away >= RESYNC_AFTER_HIDDEN_MS || (current && !live)) handlers.current.onResync();
      // Several components can share the channel; restart it once.
      if (current && isDead(current) && Date.now() - current.restartedAt > 2000) restart(current);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Polling fallback only while realtime is not live.
  useEffect(() => {
    const interval = pollIntervalFor(status);
    if (!interval || !topic) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") handlers.current.onResync();
    }, interval);
    return () => window.clearInterval(timer);
  }, [status, topic]);

  return status;
}
