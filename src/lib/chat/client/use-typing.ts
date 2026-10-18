"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 0032: live typing indicators. Ephemeral only: server-published broadcasts,
// never database writes. Signals go out at most once per THROTTLE while the
// person keeps typing, plus one "stopped" (send, idle, blur, hidden tab,
// leaving). Receivers expire an indicator after TTL on their own, so a lost
// "stopped" can never leave "is typing…" stuck on screen.
export const TYPING_THROTTLE_MS = 2_500;
export const TYPING_IDLE_MS = 4_000;
export const TYPING_TTL_MS = 6_000;

/** Sends typing / stopped through `post`; failures are ignored. */
export function useTypingSender(post: ((state: "typing" | "stopped") => void) | null) {
  const lastSent = useRef(0);
  const active = useRef(false);
  const idle = useRef<number | undefined>(undefined);
  const postRef = useRef(post);
  postRef.current = post;

  const stop = useCallback(() => {
    window.clearTimeout(idle.current);
    if (!active.current) return;
    active.current = false;
    lastSent.current = 0;
    postRef.current?.("stopped");
  }, []);

  const typing = useCallback(() => {
    if (!postRef.current) return;
    const now = Date.now();
    if (now - lastSent.current >= TYPING_THROTTLE_MS) {
      lastSent.current = now;
      active.current = true;
      postRef.current("typing");
    }
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(stop, TYPING_IDLE_MS);
  }, [stop]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);

  return { typing, stop };
}

/**
 * Who is typing on the other side, from realtime events. Cleared on
 * "stopped", after TTL without a refresh, and on reconnect (`reset`), so it
 * never flashes from a stale event.
 */
export function useTypingIndicator() {
  const [name, setName] = useState<string | null | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    setName(undefined);
  }, []);

  const onEvent = useCallback(
    (payload: Record<string, unknown>) => {
      if (payload.state !== "typing") return reset();
      setName(typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 24) : null);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(reset, TYPING_TTL_MS);
    },
    [reset],
  );

  // undefined = nobody typing; null = typing, no public name (BudgetWise).
  return { typingName: name, onEvent, reset };
}
