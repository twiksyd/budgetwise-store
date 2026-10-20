"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { CornerUpLeft, SmilePlus } from "lucide-react";
import type { ChatMessageDto, ReplyQuote } from "@/lib/chat/dto.mjs";
import { REACTIONS, reactionEmoji, type MessageReactions, type ReactionKey } from "@/lib/chat/message-meta.mjs";
import { cn } from "@/lib/utils";

/**
 * Phase 3 (0032): what a chat page lets people do with a message. Provided
 * by the customer chat and the admin conversation view; without a provider
 * (previews, old screens) bubbles show no actions.
 */
export interface MessageActions {
  react: (messageId: string, reaction: ReactionKey | null) => void;
  reply: (message: ChatMessageDto) => void;
  jumpTo: (messageId: string) => void;
  /** Who a quote is from, as this viewer should see it. */
  quoteLabel: (quote: ReplyQuote) => string;
}

export const MessageActionsContext = createContext<MessageActions | null>(null);

export function useMessageActions() {
  return useContext(MessageActionsContext);
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;

/**
 * Long-press (touch) that never fights scrolling: any movement beyond a few
 * pixels, or the finger lifting early, cancels it.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    start.current = null;
  }, []);
  useEffect(() => clear, [clear]);
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!start.current) return;
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > LONG_PRESS_SLOP_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    // A long-press must not also open the browser's own menu or a photo.
    onContextMenu: (event: React.MouseEvent) => {
      if (fired.current || start.current) event.preventDefault();
    },
    // The tap that ends a long-press must not also open a photo or a link,
    // but taps inside the picker it opened always go through.
    onClickCapture: (event: React.MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      if ((event.target as Element | null)?.closest?.('[role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** The five reactions plus Reply, kept inside the viewport on phones. */
export function ReactionPicker({
  mine,
  align,
  onPick,
  onReply,
  onClose,
}: {
  mine: ReactionKey | null;
  align: "start" | "end";
  onPick: (reaction: ReactionKey | null) => void;
  onReply: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="React or reply"
      className={cn(
        "bg-popover border-border absolute bottom-full z-30 mb-1 flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 rounded-xl border p-1 shadow-lg",
        align === "end" ? "right-0" : "left-0",
      )}
      data-testid="reaction-picker"
    >
      {REACTIONS.map((reaction) => (
        <button
          key={reaction.key}
          type="button"
          role="menuitemcheckbox"
          aria-label={reaction.label}
          aria-checked={mine === reaction.key}
          onClick={() => {
            onPick(mine === reaction.key ? null : reaction.key);
            onClose();
          }}
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-lg text-xl transition-transform motion-safe:hover:scale-110",
            mine === reaction.key && "bg-primary/15",
          )}
        >
          <span aria-hidden>{reaction.emoji}</span>
        </button>
      ))}
      <span aria-hidden className="bg-border mx-0.5 h-6 w-px" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onReply();
          onClose();
        }}
        className="text-muted-foreground hover:text-foreground inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold"
      >
        <CornerUpLeft className="size-4" aria-hidden />
        Reply
      </button>
    </div>
  );
}

/** Aggregated reactions under a bubble; tapping one toggles my own. */
export function ReactionChips({
  reactions,
  align,
  onToggle,
}: {
  reactions: MessageReactions | null;
  align: "start" | "end";
  onToggle: (reaction: ReactionKey | null) => void;
}) {
  const entries = REACTIONS.filter((reaction) => (reactions?.counts?.[reaction.key] ?? 0) > 0);
  if (!entries.length) return null;
  return (
    <div className={cn("-mt-1.5 flex flex-wrap gap-1 px-1", align === "end" ? "justify-end" : "justify-start")} data-testid="reaction-chips">
      {entries.map((reaction) => {
        const count = reactions?.counts?.[reaction.key] ?? 0;
        const mine = reactions?.mine === reaction.key;
        return (
          <button
            key={reaction.key}
            type="button"
            onClick={() => onToggle(mine ? null : reaction.key)}
            aria-pressed={mine}
            aria-label={`${reaction.label}: ${count}${mine ? ", including you. Tap to remove" : ". Tap to react"}`}
            className={cn(
              "bg-background inline-flex h-7 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold shadow-sm",
              mine ? "border-primary/50 text-primary" : "border-border text-muted-foreground",
            )}
          >
            <span aria-hidden className="text-sm leading-none">{reaction.emoji}</span>
            {count > 1 && <span className="[font-variant-numeric:tabular-nums]">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The quoted original inside a reply bubble; tapping it jumps there. */
export function QuoteBlock({ quote, isMine, label, onJump }: { quote: ReplyQuote; isMine: boolean; label: string; onJump: () => void }) {
  return (
    <button
      type="button"
      onClick={onJump}
      className={cn(
        "mb-1 block w-full max-w-full rounded-lg border-l-2 px-2.5 py-1 text-left text-xs",
        isMine ? "border-primary-foreground/70 bg-primary-foreground/15" : "border-primary/60 bg-background/60",
      )}
      aria-label={`Replying to ${label}: ${quote.preview}. Show original message`}
      data-testid="reply-quote"
    >
      <span className={cn("block font-semibold", isMine ? "text-primary-foreground" : "text-primary")}>{label}</span>
      <span className={cn("line-clamp-2 break-words", isMine ? "text-primary-foreground/85" : "text-muted-foreground")}>{quote.preview}</span>
    </button>
  );
}

/** Desktop: a small hover / keyboard-focus toolbar next to the bubble. */
export function HoverActions({ onOpenPicker, onReply }: { onOpenPicker: () => void; onReply: () => void }) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 [@media(hover:none)]:sr-only">
      <button
        type="button"
        onClick={onOpenPicker}
        aria-label="React"
        className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg"
      >
        <SmilePlus className="size-4" />
      </button>
      <button
        type="button"
        onClick={onReply}
        aria-label="Reply"
        className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg"
      >
        <CornerUpLeft className="size-4" />
      </button>
    </div>
  );
}

export { reactionEmoji };
