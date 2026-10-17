"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { prepareChatImage } from "@/lib/prepare-chat-image";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_LENGTH,
  validateAttachmentMeta,
} from "@/lib/order-chat.mjs";
import { cn } from "@/lib/utils";
import {
  toChatMessage,
  type ChatMessage,
  type ChatMessageRowLike,
  type ChatViewerRole,
} from "@/types/order-chat";

const POLL_INTERVAL_MS = 8000;

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return current;

  const byId = new Map(current.map((message) => [message.id, message]));
  let changed = false;
  for (const message of incoming) {
    const existing = byId.get(message.id);
    // A newer copy of a message we already hold (e.g. it was just read) wins.
    if (!existing || existing.readAt !== message.readAt) {
      byId.set(message.id, message);
      changed = true;
    }
  }
  if (!changed) return current;

  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id.localeCompare(b.id)
      : a.createdAt < b.createdAt
        ? -1
        : 1,
  );
}

export function OrderChat({
  orderNumber,
  viewerRole,
  initialMessages,
  className,
}: {
  orderNumber: string;
  viewerRole: ChatViewerRole;
  initialMessages: ChatMessage[];
  className?: string;
}) {
  const apiBase = `/api/order-chat/${encodeURIComponent(orderNumber)}`;
  const actingAs = `as=${viewerRole}`;

  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"live" | "polling">("polling");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);
  const latestCreatedAtRef = useRef<string | null>(null);
  const readInFlightRef = useRef(false);

  const otherRole: ChatViewerRole = viewerRole === "customer" ? "admin" : "customer";

  useEffect(() => {
    latestCreatedAtRef.current =
      messages.length > 0 ? messages[messages.length - 1].createdAt : null;
  }, [messages]);

  const addMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  // Keep the newest message in view.
  const messageCount = messages.length;
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messageCount]);

  // --- Live updates -------------------------------------------------------
  // Realtime pushes a message the moment it lands. Polling runs alongside as
  // a safety net (a dropped socket, a phone waking from sleep), and is the
  // only path if Realtime isn't enabled on the project.
  const poll = useCallback(async () => {
    try {
      const after = latestCreatedAtRef.current;
      const query = after
        ? `${actingAs}&after=${encodeURIComponent(after)}`
        : actingAs;
      const response = await fetch(`${apiBase}/messages?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as { messages: ChatMessage[] };
      addMessages(body.messages);
    } catch {
      // Offline or a blip; the next tick tries again.
    }
  }, [actingAs, addMessages, apiBase]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-chat:${orderNumber}:${viewerRole}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_order_messages",
          filter: `order_number=eq.${orderNumber}`,
        },
        (payload) => {
          const row = payload.new as ChatMessageRowLike | undefined;
          if (row?.id) addMessages([toChatMessage(row)]);
        },
      )
      .subscribe((status) => {
        setConnection(status === "SUBSCRIBED" ? "live" : "polling");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [addMessages, orderNumber, viewerRole]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void poll();
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [poll]);

  // --- Read receipts ------------------------------------------------------
  const hasUnreadFromOther = useMemo(
    () =>
      messages.some(
        (message) => message.senderRole === otherRole && !message.readAt,
      ),
    [messages, otherRole],
  );

  useEffect(() => {
    if (!hasUnreadFromOther || readInFlightRef.current) return;
    if (document.visibilityState !== "visible") return;

    readInFlightRef.current = true;
    void fetch(`${apiBase}/read?${actingAs}`, { method: "POST" })
      .then((response) => {
        if (!response.ok) return;
        const now = new Date().toISOString();
        setMessages((current) =>
          current.map((message) =>
            message.senderRole === otherRole && !message.readAt
              ? { ...message, readAt: now }
              : message,
          ),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        readInFlightRef.current = false;
      });
  }, [actingAs, apiBase, hasUnreadFromOther, otherRole]);

  // --- Attachment preview -------------------------------------------------
  useEffect(() => {
    if (!attachment) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    setError(null);
    const prepared = await prepareChatImage(picked);
    const check = validateAttachmentMeta({
      type: prepared.type,
      size: prepared.size,
    });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setAttachment(prepared);
  }

  async function handleSend(event?: React.FormEvent) {
    event?.preventDefault();
    if (isSendingRef.current) return;

    const text = draft.trim();
    if (!text && !attachment) return;

    isSendingRef.current = true;
    setIsSending(true);
    setError(null);

    try {
      const form = new FormData();
      form.set("body", text);
      if (attachment) form.set("file", attachment);

      const response = await fetch(`${apiBase}/messages?${actingAs}`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => null)) as {
        message?: ChatMessage;
        error?: string;
      } | null;

      if (!response.ok || !body?.message) {
        setError(body?.error ?? "Couldn't send that. Please try again.");
        return;
      }

      addMessages([body.message]);
      setDraft("");
      setAttachment(null);
    } catch {
      setError("Walang connection. Please try again.");
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Enter sends, Shift+Enter adds a line. On touch keyboards the
    // Enter key is a newline and the Send button is the way to send.
    if (event.key === "Enter" && !event.shiftKey && !isTouchDevice()) {
      event.preventDefault();
      void handleSend();
    }
  }

  const lastOwnMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].senderRole === viewerRole) return messages[index].id;
    }
    return null;
  }, [messages, viewerRole]);

  return (
    <section
      className={cn(
        "surface-premium flex min-h-[28rem] flex-col overflow-hidden rounded-2xl",
        className,
      )}
      aria-label="Order chat"
    >
      <header className="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold">
            {viewerRole === "customer" ? "Chat with BudgetWise" : "Customer chat"}
          </h2>
          <p className="text-muted-foreground truncate text-xs">
            Order {orderNumber}
          </p>
        </div>
        <span
          className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-xs"
          title={
            connection === "live"
              ? "Live — new messages appear instantly"
              : "Checking for new messages every few seconds"
          }
        >
          <span
            className={cn(
              "size-2 rounded-full",
              connection === "live" ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          {connection === "live" ? "Live" : "Syncing"}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex max-h-[60vh] min-h-72 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-4"
        role="log"
        aria-live="polite"
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={message.senderRole === viewerRole}
            showSeen={message.id === lastOwnMessageId}
            viewerRole={viewerRole}
          />
        ))}
      </div>

      <form
        onSubmit={handleSend}
        className="border-border/60 flex flex-col gap-2 border-t p-3"
      >
        {previewUrl && (
          <div className="bg-muted/50 flex items-center gap-3 rounded-xl p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img
              src={previewUrl}
              alt="Selected image"
              className="size-14 rounded-lg object-cover"
            />
            <p className="min-w-0 flex-1 truncate text-xs">
              {attachment?.name}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove image"
              onClick={() => setAttachment(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive text-xs leading-relaxed">
            {error}
          </p>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={handleFilePicked}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Attach an image"
            title={`Attach a photo or screenshot (up to ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB)`}
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
          >
            <ImagePlus className="size-4" />
          </Button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={
              viewerRole === "customer"
                ? "Mag-type ng message..."
                : "Reply to customer..."
            }
            aria-label="Message"
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 field-sizing-content max-h-32 min-h-11 flex-1 resize-none rounded-lg border px-3 py-2.5 text-base outline-none focus-visible:ring-3 sm:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={isSending || (!draft.trim() && !attachment)}
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function isTouchDevice() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function MessageBubble({
  message,
  isOwn,
  showSeen,
  viewerRole,
}: {
  message: ChatMessage;
  isOwn: boolean;
  showSeen: boolean;
  viewerRole: ChatViewerRole;
}) {
  const senderLabel =
    message.senderRole === "admin"
      ? "BudgetWise"
      : viewerRole === "customer"
        ? "You"
        : "Customer";

  return (
    <div className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[80%]",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md",
        )}
      >
        {message.kind === "slip" && (
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide uppercase opacity-80">
            Order slip
          </p>
        )}

        {message.kind === "image" && message.hasAttachment && (
          <a
            href={`/api/order-chat/attachments/${message.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1.5 block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked redirect */}
            <img
              src={`/api/order-chat/attachments/${message.id}`}
              alt="Sent image"
              loading="lazy"
              className="max-h-64 w-auto rounded-lg object-cover"
            />
          </a>
        )}

        {message.body && (
          <p
            className={cn(
              "break-words whitespace-pre-wrap",
              message.kind === "slip" && "text-[13px]",
            )}
          >
            {message.body}
          </p>
        )}
      </div>
      <p className="text-muted-foreground px-1 text-[11px]">
        {senderLabel} ·{" "}
        <time dateTime={message.createdAt} suppressHydrationWarning>
          {timeFormatter.format(new Date(message.createdAt))}
        </time>
        {isOwn && showSeen && message.readAt ? " · Seen" : null}
      </p>
    </div>
  );
}
