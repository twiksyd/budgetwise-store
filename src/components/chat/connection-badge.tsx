import type { ConnectionStatus } from "@/lib/chat/connection-state.mjs";
import { cn } from "@/lib/utils";

const LABELS: Record<ConnectionStatus, { text: string; title: string; dot: string }> = {
  live: { text: "Live", title: "Connected — new messages appear instantly", dot: "bg-emerald-500" },
  reconnecting: {
    text: "Reconnecting",
    title: "Realtime dropped — reconnecting. Checking for messages every few seconds meanwhile.",
    dot: "bg-amber-500 animate-pulse",
  },
  offline: { text: "Offline", title: "No internet connection", dot: "bg-red-500" },
};

export function ConnectionBadge({ status, className }: { status: ConnectionStatus; className?: string }) {
  const label = LABELS[status];
  return (
    <span
      className={cn("text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", className)}
      title={label.title}
      role="status"
      aria-live="polite"
    >
      <span className={cn("size-2 rounded-full", label.dot)} aria-hidden />
      {label.text}
    </span>
  );
}
