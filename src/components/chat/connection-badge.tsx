"use client";

import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/lib/chat/connection-state.mjs";
import { cn } from "@/lib/utils";

const LABELS: Record<Exclude<ConnectionStatus, "idle">, { text: string; title: string; dot: string }> = {
  connecting: { text: "Connecting…", title: "Connecting to live updates", dot: "bg-muted-foreground/40" },
  live: { text: "Live", title: "Connected — new messages appear instantly", dot: "bg-emerald-500" },
  reconnecting: {
    text: "Reconnecting",
    title: "Realtime dropped — reconnecting. Checking for messages every few seconds meanwhile.",
    dot: "bg-amber-500",
  },
  offline: { text: "Offline", title: "No internet connection", dot: "bg-red-500" },
};

const isProblem = (status: ConnectionStatus) => status === "reconnecting" || status === "offline";

/**
 * Live is shown quietly; the first connect is never a warning. Mobile
 * networks hop between connections all the time, so Reconnecting / Offline
 * only appear once a drop has lasted `graceMs` — until then the previous
 * state stays on screen (no flashing between states).
 */
export function ConnectionBadge({
  status,
  className,
  graceMs = 0,
}: {
  status: ConnectionStatus;
  className?: string;
  graceMs?: number;
}) {
  const [shown, setShown] = useState<ConnectionStatus>(isProblem(status) && graceMs > 0 ? "connecting" : status);

  useEffect(() => {
    if (!(isProblem(status) && graceMs > 0)) {
      setShown(status);
      return;
    }
    const timer = window.setTimeout(() => setShown(status), graceMs);
    return () => window.clearTimeout(timer);
  }, [status, graceMs]);

  if (shown === "idle") return null;
  const label = LABELS[shown];
  const problem = isProblem(shown);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
        problem ? "text-foreground rounded-full bg-amber-500/10 px-2 py-0.5" : "text-muted-foreground",
        className,
      )}
      title={label.title}
      role="status"
      aria-live="polite"
      data-connection={shown}
    >
      <span className={cn("size-2 rounded-full", label.dot)} aria-hidden />
      {label.text}
    </span>
  );
}
