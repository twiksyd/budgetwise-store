"use client";
import { toast } from "sonner";
export function HistoryUnread({ sources, onFocus }: { sources?: { sourceKey: string; unread: number; firstUnreadId: string | null }[]; onFocus: (id: string) => Promise<boolean> }) {
  const unread = sources?.filter((s) => s.unread > 0) ?? [];
  if (!unread.length) return null;
  return <div aria-label="Unread historical orders" className="border-border/60 bg-muted/30 flex max-h-32 shrink-0 flex-wrap gap-2 overflow-y-auto border-b px-4 py-2">
    {unread.map((s) => <button key={s.sourceKey} type="button" className="text-primary rounded-lg border px-3 py-1.5 text-xs font-medium focus-visible:outline-2" onClick={async () => {
      if (!s.firstUnreadId || !await onFocus(s.firstUnreadId)) { toast.error("Unable to load unread history."); return; }
      requestAnimationFrame(() => document.getElementById(`message-${s.firstUnreadId}`)?.scrollIntoView({ block: "center", behavior: "instant" }));
    }}>{s.sourceKey} · {s.unread} unread</button>)}
  </div>;
}
