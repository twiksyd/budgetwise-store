"use client";

import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/lib/chat/connection-state.mjs";
import { cn } from "@/lib/utils";

type Shown = ConnectionStatus | "connecting";

const LABELS: Record<Shown, { text: string; title: string; dot: string }> = {
  connecting: { text: "Connecting…", title: "Connecting to live updates", dot: "bg-muted-foreground/40" },
  live: { text: "Live", title: "Connected — new messages appear instantly", dot: "bg-emerald-500" },
  reconnecting: {
    text: "Reconnecting",
    title: "Realtime dropped — reconnecting. Checking for messages every few seconds meanwhile.",
    dot: "bg-amber-500",
  },
  offline: { text: "Offline", title: "No internet connection", dot: "bg-red-500" },
};

/**
 * Live is shown quietly. Mobile networks hop between connections all the
 * time, so Reconnecting / Offline only appear once a drop has lasted
 * `graceMs` (and then stay calm — no flashing between states).
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
  const [shown, setShown] = useState<Shown>(status === "live" || graceMs === 0 ? status : "connecting");

  useEffect(() => {
    if (status === "live" || graceMs === 0) {
      setShown(status);
      return;
    }
    const timer = window.setTimeout(() => setShown(status), graceMs);
    return () => window.clearTimeout(timer);
  }, [status, graceMs]);

  const label = LABELS[shown];
  const problem = shown === "reconnecting" || shown === "offline";
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
    >
      <span className={cn("size-2 rounded-full", label.dot)} aria-hidden />
      {label.text}
    </span>
  );
}
