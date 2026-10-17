"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deriveConnectionStatus,
  pollIntervalFor,
  reconnectDelay,
  shouldResync,
  type ConnectionStatus,
} from "@/lib/chat/connection-state.mjs";

/**
 * Subscribes to ONE private broadcast topic for the lifetime of the
 * component. Reports the real connection state (never "live" unless the
 * channel is actually SUBSCRIBED), re-creates dead channels with backoff,
 * and calls onResync whenever events may have been missed: after a
 * reconnect, when the tab becomes visible again, and on a polling interval
 * while realtime is down.
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
  const [channelState, setChannelState] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [generation, setGeneration] = useState(0);
  const handlers = useRef({ onEvent, onResync });
  handlers.current = { onEvent, onResync };
  const attempt = useRef(0);
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
    if (!topic) return;
    const supabase = createClient();
    let disposed = false;
    let retryTimer: number | undefined;

    const channel = supabase.channel(topic, { config: { private: true } });
    for (const event of eventsKey.split(",")) {
      channel.on("broadcast", { event }, (message) => {
        handlers.current.onEvent(event, (message.payload ?? {}) as Record<string, unknown>);
      });
    }

    void (async () => {
      // Private channels are authorised with the user's JWT.
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel.subscribe((status) => {
        if (disposed) return;
        setChannelState(status);
        if (status === "SUBSCRIBED") {
          attempt.current = 0;
          return;
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => {
            if (!disposed) setGeneration((value) => value + 1);
          }, reconnectDelay(attempt.current++));
        }
      });
    })();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      setChannelState(null);
      void supabase.removeChannel(channel);
    };
  }, [topic, eventsKey, generation]);

  const status = deriveConnectionStatus({ online, channelState });

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

  // Phone/laptop waking up: resync, and force a fresh channel if it died.
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      handlers.current.onResync();
      if (statusRef.current !== "live") setGeneration((value) => value + 1);
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
