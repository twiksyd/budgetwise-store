"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { MessageActions } from "@/components/chat/message-actions";
import type { ChatMessageDto, ReplyQuote } from "@/lib/chat/dto.mjs";
import { quotePreviewFromDto, type MessageReactions, type ReactionKey } from "@/lib/chat/message-meta.mjs";

type ReplyTarget = { id: string; key: string; senderLabel: string; preview: string };

interface ThreadLike {
  sendText: (text: string, replyTo?: { id: string; senderLabel: string; preview: string } | null) => string;
  react: (messageId: string, reaction: ReactionKey | null) => Promise<void>;
  ensureMessageLoaded: (messageId: string) => Promise<boolean>;
}

/**
 * Phase 3 (0032) wiring shared by the customer chat and the admin view:
 * reactions, Reply (with the composer preview) and "jump to the quoted
 * message" — which pages older history in order rather than fetching a
 * lone message, so the thread never gets a gap.
 */
export function useMessageFeatures({
  thread,
  senderLabelOf,
  quoteLabel,
}: {
  thread: ThreadLike;
  /** Who wrote a message, as this viewer says it in "Replying to …". */
  senderLabelOf: (message: ChatMessageDto) => string;
  quoteLabel: (quote: ReplyQuote) => string;
}) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const { sendText: send, react, ensureMessageLoaded } = thread;

  const jumpTo = useCallback(
    async (messageId: string) => {
      const found = await ensureMessageLoaded(messageId);
      if (!found) {
        toast.info("The original message isn't available anymore.");
        return;
      }
      requestAnimationFrame(() => {
        const node = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
        if (!node) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        node.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        node.classList.remove("bw-jump-highlight");
        void node.offsetWidth; // restart the highlight if it is already showing
        node.classList.add("bw-jump-highlight");
        window.clearTimeout(highlightTimer.current);
        highlightTimer.current = window.setTimeout(() => node.classList.remove("bw-jump-highlight"), 1800);
      });
    },
    [ensureMessageLoaded],
  );

  const actions = useMemo<MessageActions>(
    () => ({
      react: (messageId, reaction) => void react(messageId, reaction),
      reply: (message) =>
        setReplyTo({
          id: message.id,
          key: `${message.id}:${Date.now()}`,
          senderLabel: senderLabelOf(message),
          preview: quotePreviewFromDto(message),
        }),
      jumpTo: (messageId) => void jumpTo(messageId),
      quoteLabel,
    }),
    [react, jumpTo, senderLabelOf, quoteLabel],
  );

  const sendText = useCallback(
    (text: string) => {
      const target = replyTo ? { id: replyTo.id, senderLabel: replyTo.senderLabel, preview: replyTo.preview } : null;
      setReplyTo(null);
      return send(text, target);
    },
    [send, replyTo],
  );

  const cancelReply = useCallback(() => setReplyTo(null), []);

  return { actions, replyTo, cancelReply, sendText };
}

/** A live 'reaction' event for one viewer (null when none are left). */
export type ReactionPatch = { reactions: MessageReactions | null };
