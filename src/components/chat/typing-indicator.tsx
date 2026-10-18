"use client";

/** "Twicks is typing…" with three soft dots (static for reduced motion). */
export function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground mt-2 flex items-center gap-2 px-1 text-xs" role="status" aria-live="polite" data-testid="typing-indicator">
      <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2.5 py-2" aria-hidden>
        <span className="bw-typing-dot bg-muted-foreground/70 size-1.5 rounded-full" />
        <span className="bw-typing-dot bg-muted-foreground/70 size-1.5 rounded-full [animation-delay:150ms]" />
        <span className="bw-typing-dot bg-muted-foreground/70 size-1.5 rounded-full [animation-delay:300ms]" />
      </span>
      <span className="italic">{label}</span>
    </div>
  );
}
