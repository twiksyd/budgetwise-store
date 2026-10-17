"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, ImageIcon, RotateCcw, X } from "lucide-react";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import type { PendingMessage } from "@/lib/chat/thread-state.mjs";
import { PaymentCard } from "@/components/chat/payment-card";
import { cn } from "@/lib/utils";

const TIME = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
});

export function formatTime(iso: string) {
  return TIME.format(new Date(iso));
}

function bubbleShape(isMine: boolean, first: boolean, last: boolean) {
  // Tight corners where bubbles in a group meet, round everywhere else.
  if (isMine) return cn("rounded-2xl", !first && "rounded-tr-md", !last && "rounded-br-md");
  return cn("rounded-2xl", !first && "rounded-tl-md", !last && "rounded-bl-md");
}

export function MessageBubble({
  message,
  isMine,
  firstInGroup,
  lastInGroup,
  senderLabel,
  statusLabel,
  orderNumber,
  onOpenImage,
  onMediaLoad,
}: {
  message: ChatMessageDto;
  isMine: boolean;
  firstInGroup: boolean;
  lastInGroup: boolean;
  senderLabel: string | null;
  statusLabel: string | null;
  orderNumber: string;
  onOpenImage: (src: string) => void;
  onMediaLoad: () => void;
}) {
  const attachmentSrc = `/api/order-chat/attachments/${message.id}`;

  return (
    <div
      data-message-id={message.id}
      className={cn("flex flex-col", isMine ? "items-end" : "items-start", firstInGroup ? "mt-3" : "mt-0.5")}
    >
      {firstInGroup && senderLabel && (
        <p className={cn("text-muted-foreground mb-1 px-1 text-[11px] font-semibold", isMine && "text-right")}>
          {senderLabel}
        </p>
      )}

      {message.kind === "payment" && message.payment ? (
        <PaymentCard card={message.payment} orderNumber={orderNumber} messageId={message.id} />
      ) : message.kind === "slip" ? (
        <SlipCard body={message.body} isMine={isMine} />
      ) : (
        <div
          className={cn(
            "max-w-[85%] overflow-hidden text-[15px] leading-relaxed sm:max-w-[75%] sm:text-sm",
            bubbleShape(isMine, firstInGroup, lastInGroup),
            message.kind === "image" && !message.body
              ? "bg-transparent p-0"
              : isMine
                ? "bg-primary text-primary-foreground px-3.5 py-2"
                : "bg-muted text-foreground px-3.5 py-2",
          )}
        >
          {message.kind === "image" && message.hasAttachment && (
            <button
              type="button"
              onClick={() => onOpenImage(attachmentSrc)}
              className={cn("block overflow-hidden rounded-xl", message.body && "-mx-1.5 -mt-0.5 mb-1.5")}
              aria-label="View image"
            >
              {/* Natural aspect ratio, capped box: never stretched or cropped. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked redirect */}
              <img
                src={attachmentSrc}
                alt="Sent image"
                loading="lazy"
                onLoad={onMediaLoad}
                className="bg-muted block h-auto max-h-72 w-auto max-w-[min(18rem,100%)] object-contain"
              />
            </button>
          )}
          {message.body && <p className="break-words whitespace-pre-wrap">{message.body}</p>}
        </div>
      )}

      {lastInGroup && (
        <p className="text-muted-foreground mt-1 px-1 text-[11px]">
          <time dateTime={message.createdAt} suppressHydrationWarning>
            {formatTime(message.createdAt)}
          </time>
          {statusLabel ? <span> · {statusLabel}</span> : null}
        </p>
      )}
    </div>
  );
}

function SlipCard({ body, isMine }: { body: string; isMine: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = body.split("\n");
  const long = lines.length > 8;
  const shown = expanded || !long ? body : lines.slice(0, 8).join("\n");

  return (
    <div
      className={cn(
        "border-border bg-background w-full max-w-sm rounded-2xl border p-3.5 text-left shadow-sm",
        isMine ? "ml-auto" : "",
      )}
    >
      <p className="text-primary text-[11px] font-bold tracking-wide uppercase">Order slip</p>
      <p className="text-foreground mt-1.5 text-[13px] leading-relaxed break-words whitespace-pre-wrap">
        {shown}
        {!expanded && long ? "…" : ""}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-semibold"
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? "Show less" : "Show full slip"}
        </button>
      )}
    </div>
  );
}

export function PendingBubble({
  item,
  onRetry,
  onDiscard,
}: {
  item: PendingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const failed = item.status === "failed";
  return (
    <div className="mt-0.5 flex flex-col items-end" data-pending-id={item.clientMessageId}>
      <div
        className={cn(
          "bg-primary text-primary-foreground max-w-[85%] overflow-hidden rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed sm:max-w-[75%] sm:text-sm",
          failed ? "opacity-70" : "opacity-80",
        )}
      >
        {item.kind === "image" && (
          <div className="relative -mx-1.5 -mt-0.5 mb-1.5 overflow-hidden rounded-xl">
            {item.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={item.previewUrl} alt="" className="block h-auto max-h-72 w-auto max-w-[min(18rem,100%)] object-contain" />
            ) : (
              <ImageIcon className="m-6 size-8" />
            )}
            {!failed && (
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                <div className="h-full bg-white transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        {item.body && <p className="break-words whitespace-pre-wrap">{item.body}</p>}
      </div>
      {failed ? (
        <div className="text-destructive mt-1 flex items-center gap-2 px-1 text-[11px] font-medium">
          <AlertCircle className="size-3.5" />
          <span>{item.error ?? "Not sent."}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            <RotateCcw className="size-3" /> Retry
          </button>
          <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 underline-offset-2 hover:underline" aria-label="Remove unsent message">
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-1 px-1 text-[11px]">
          {item.kind === "image" ? `Uploading ${Math.round(item.progress * 100)}%…` : "Sending…"}
        </p>
      )}
    </div>
  );
}
