"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import {
  buildDisplayItems,
  countNewArrivals,
  findFirstUnreadIndex,
  isSeen,
  type ThreadState,
} from "@/lib/chat/thread-state.mjs";
import { MediaViewer, type ViewerItem } from "@/components/chat/media-viewer";
import { MessageBubble, PendingBubble, type SlipInfo } from "@/components/chat/message-bubble";
import { cn } from "@/lib/utils";

type Cursor = { at: string | null; messageId: string | null } | null;
const NEAR_BOTTOM_PX = 96;
/** Tallest a single chat image/gallery can render (max-h-80 + label). */
const MAX_MEDIA_HEIGHT_PX = 400;
/** Beyond this distance from the latest message a "jump to latest" arrow shows. */
const FAR_FROM_BOTTOM_PX = 640;
const NEAR_TOP_PX = 160;

/**
 * Scroll behaviour of a professional messenger:
 *  - opens at the first unread message (or the newest);
 *  - new messages scroll into view only if you are already near the bottom,
 *    otherwise a "N new messages ↓" pill appears;
 *  - scrolling to the top loads older pages without moving what you read.
 */
export function ChatThread({
  state,
  orderNumber,
  isOwnSide,
  isMine,
  senderLabelFor,
  otherSideReadCursor,
  initialReadCursor,
  onLoadOlder,
  onRetry,
  onDiscard,
  onReadUpTo,
  emptyState,
  footer,
  className,
  loadError = false,
  onReload,
  slip,
}: {
  state: ThreadState;
  /** Order identity for the compact "Order placed" card (replaces the slip text). */
  slip?: SlipInfo | null;
  /** The first page could not be loaded (shows a retry instead of a skeleton). */
  loadError?: boolean;
  onReload?: () => void;
  orderNumber: string;
  /** Messages from my side of the conversation (right-aligned). */
  isOwnSide: (message: ChatMessageDto) => boolean;
  /** Messages I personally sent (not counted as "new"). */
  isMine: (message: ChatMessageDto) => boolean;
  senderLabelFor: (message: ChatMessageDto) => string | null;
  otherSideReadCursor: Cursor;
  initialReadCursor: Cursor;
  onLoadOlder: () => void;
  onRetry: (clientMessageId: string) => void;
  onDiscard: (clientMessageId: string) => void;
  /** Called with the newest message id while it is actually on screen. */
  onReadUpTo: (messageId: string) => void;
  emptyState?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [newCount, setNewCount] = useState(0);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const [farFromBottom, setFarFromBottom] = useState(false);
  const openMedia = useCallback((items: ViewerItem[], index: number) => setViewer({ items, index }), []);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const items = useMemo(() => buildDisplayItems(state.messages, { nowMs }), [state.messages, nowMs]);

  // Unread divider: fixed when the thread first loads, so it stays put
  // while the admin/customer reads.
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const initialized = useRef(false);

  // Where to keep the reader when an older page is prepended.
  const restore = useRef<{ height: number; top: number } | null>(null);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const node = scroller.current;
    if (!node) return;
    // Jumping to the latest cancels a pending "keep my place" from an older
    // page still loading — it must not yank the reader back up afterwards.
    restore.current = null;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
    setNewCount(0);
  }, []);

  const reportRead = useCallback(() => {
    if (!atBottom.current || document.visibilityState !== "visible") return;
    const newest = [...state.messages].reverse().find((message) => !isOwnSide(message));
    if (newest) onReadUpTo(newest.id);
  }, [state.messages, isOwnSide, onReadUpTo]);

  // Initial position.
  useLayoutEffect(() => {
    if (initialized.current || !state.loaded) return;
    initialized.current = true;
    const index = findFirstUnreadIndex(state.messages, initialReadCursor, isOwnSide);
    const firstUnread = index > 0 ? state.messages[index] : null;
    if (firstUnread) {
      setFirstUnreadId(firstUnread.id);
      requestAnimationFrame(() => {
        const node = scroller.current?.querySelector(`[data-message-id="${firstUnread.id}"]`);
        if (node instanceof HTMLElement && scroller.current) {
          scroller.current.scrollTop = Math.max(0, node.offsetTop - 72);
          const { scrollHeight, scrollTop, clientHeight } = scroller.current;
          atBottom.current = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_PX;
        }
      });
    } else {
      scrollToBottom(false);
    }
  }, [state.loaded, state.messages, initialReadCursor, isOwnSide, scrollToBottom]);

  // New messages at the end.
  const previousMessages = useRef(state.messages);
  const previousNewest = useRef<string | null>(null);
  useLayoutEffect(() => {
    const newest = state.messages[state.messages.length - 1]?.id ?? null;
    const prev = previousMessages.current;
    if (initialized.current && newest && newest !== previousNewest.current && previousNewest.current !== null) {
      const latest = state.messages[state.messages.length - 1];
      if (atBottom.current || isMine(latest)) {
        scrollToBottom(true);
      } else {
        setNewCount((count) => count + countNewArrivals(prev, state.messages, isMine));
      }
    }
    previousNewest.current = newest;
    previousMessages.current = state.messages;
  }, [state.messages, isMine, scrollToBottom]);

  // Sending always brings my own new bubble into view.
  const pendingCount = state.pending.length;
  const previousPending = useRef(pendingCount);
  useEffect(() => {
    if (pendingCount > previousPending.current) scrollToBottom(true);
    previousPending.current = pendingCount;
  }, [pendingCount, scrollToBottom]);

  // Keep reporting read position while at the bottom.
  useEffect(() => {
    reportRead();
    const onVisible = () => reportRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reportRead]);

  // Older pages: preserve what is on screen.
  const oldestId = state.messages[0]?.id;
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !restore.current) return;
    node.scrollTop = node.scrollHeight - restore.current.height + restore.current.top;
    restore.current = null;
  }, [oldestId]);

  function handleScroll() {
    const node = scroller.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setFarFromBottom(distance > FAR_FROM_BOTTOM_PX);
    const wasAtBottom = atBottom.current;
    atBottom.current = distance < NEAR_BOTTOM_PX;
    if (atBottom.current) {
      setNewCount(0);
      if (!wasAtBottom) reportRead();
    }
    if (node.scrollTop < NEAR_TOP_PX && state.hasOlder && !state.loadingOlder) {
      restore.current = { height: node.scrollHeight, top: node.scrollTop };
      onLoadOlder();
    }
  }

  // Images change height after load; stay pinned if we were at the bottom.
  // If the reader has already scrolled well away (and the scroll event just
  // hasn't been handled yet), never yank them back down.
  const onMediaLoad = useCallback(() => {
    const node = scroller.current;
    if (!atBottom.current || !node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distance > NEAR_BOTTOM_PX + MAX_MEDIA_HEIGHT_PX) {
      atBottom.current = false;
      return;
    }
    scrollToBottom(false);
  }, [scrollToBottom]);

  // "Seen"/"Sent" goes under my side's newest message only.
  const lastOwn = useMemo(
    () => [...state.messages].reverse().find((message) => isOwnSide(message)) ?? null,
    [state.messages, isOwnSide],
  );

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div
        ref={scroller}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-2 sm:px-5"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {state.loadingOlder && (
          <div className="text-muted-foreground flex justify-center py-2 text-xs">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
        {!state.hasOlder && state.loaded && state.messages.length > 0 && (
          <p className="text-muted-foreground py-3 text-center text-[11px]">Start of conversation</p>
        )}
        {!state.loaded &&
          (loadError ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-sm">
              <p>Couldn&apos;t load messages.</p>
              {onReload && (
                <button type="button" onClick={onReload} className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-xs font-semibold">
                  Try again
                </button>
              )}
            </div>
          ) : (
            <ThreadSkeleton />
          ))}
        {state.loaded && state.messages.length === 0 && state.pending.length === 0 && emptyState}

        {items.map((item) =>
          item.type === "date" ? (
            <div key={item.key} className="my-4 flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-[11px] font-semibold" suppressHydrationWarning>
                {item.label}
              </span>
              <span className="bg-border h-px flex-1" />
            </div>
          ) : (
            <div key={item.key}>
              {item.message.id === firstUnreadId && (
                <div className="my-3 flex items-center gap-3" aria-label="Unread messages start here">
                  <span className="bg-primary/40 h-px flex-1" />
                  <span className="text-primary text-[11px] font-bold">Unread</span>
                  <span className="bg-primary/40 h-px flex-1" />
                </div>
              )}
              <MessageBubble
                message={item.message}
                isMine={isOwnSide(item.message)}
                firstInGroup={item.firstInGroup}
                lastInGroup={item.lastInGroup}
                senderLabel={senderLabelFor(item.message)}
                statusLabel={
                  lastOwn && item.message.id === lastOwn.id
                    ? isSeen(item.message, otherSideReadCursor)
                      ? "Seen"
                      : "Sent"
                    : null
                }
                orderNumber={orderNumber}
                slip={slip}
                onOpenMedia={openMedia}
                onMediaLoad={onMediaLoad}
              />
            </div>
          ),
        )}

        {state.pending.map((item) => (
          <PendingBubble
            key={item.clientMessageId}
            item={item}
            onRetry={() => onRetry(item.clientMessageId)}
            onDiscard={() => onDiscard(item.clientMessageId)}
          />
        ))}
        {footer}
      </div>

      {newCount === 0 && farFromBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="bg-background text-foreground border-border absolute right-3 bottom-3 inline-flex size-10 items-center justify-center rounded-full border shadow-lg"
          aria-label="Jump to latest message"
        >
          <ArrowDown className="size-4" />
        </button>
      )}

      {newCount > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="bg-primary text-primary-foreground absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold shadow-lg"
        >
          {newCount} new message{newCount === 1 ? "" : "s"}
          <ArrowDown className="size-3.5" />
        </button>
      )}

      <MediaViewer
        items={viewer?.items ?? []}
        index={viewer?.index ?? null}
        onIndexChange={(index) => setViewer((current) => (current ? { ...current, index } : current))}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}

/** First load only: a few placeholder bubbles inside the thread, nothing else blocks. */
function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading messages">
      {["w-2/3", "ml-auto w-1/2", "w-3/5", "ml-auto w-2/5", "w-1/2"].map((width, index) => (
        <div key={index} className={cn("bg-muted h-10 animate-pulse rounded-2xl", width)} />
      ))}
    </div>
  );
}
