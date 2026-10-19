"use client";

import { useCallback, useContext, useState } from "react";
import { AlertCircle, BadgeCheck, ImageIcon, ReceiptText, RotateCcw, X } from "lucide-react";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import type { PendingMessage } from "@/lib/chat/thread-state.mjs";
import { albumCaption, albumLayout, ALBUM_LABEL_TEXT } from "@/lib/chat/album.mjs";
import { uploadProgressText } from "@/lib/chat/upload-queue.mjs";
import { PaymentCard } from "@/components/chat/payment-card";
import { OrderSlipCard } from "@/components/chat/order-slip-card";
import { ProductCardViewerContext, ProductRecommendationCard } from "@/components/chat/product-card";
import { VouchRequestCard } from "@/components/chat/vouch-request-card";
import {
  HoverActions,
  QuoteBlock,
  ReactionChips,
  ReactionPicker,
  useLongPress,
  useMessageActions,
} from "@/components/chat/message-actions";
import type { ViewerItem } from "@/components/chat/media-viewer";
import { formatPrice } from "@/lib/pricing";
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

/** Who, which order, how much: shown instead of the old copied-message slip. */
export interface SlipInfo {
  robloxUsername: string | null;
  orderNumber: string;
  total: number | null;
}

export type OpenMedia = (items: ViewerItem[], index: number) => void;

const mediaSrc = (id: string, size: "thumb" | "full") => `/api/order-chat/media/${id}?size=${size}`;

export function MessageBubble({
  message,
  isMine,
  firstInGroup,
  lastInGroup,
  senderLabel,
  senderIcon,
  statusLabel,
  orderNumber,
  slip,
  onOpenMedia,
  onMediaLoad,
}: {
  message: ChatMessageDto;
  isMine: boolean;
  firstInGroup: boolean;
  lastInGroup: boolean;
  senderLabel: string | null;
  /** Small avatar shown before the group's sender label (customer view: the brand logo). */
  senderIcon?: React.ReactNode;
  statusLabel: string | null;
  orderNumber: string;
  slip?: SlipInfo | null;
  onOpenMedia: OpenMedia;
  onMediaLoad: () => void;
}) {
  const isMedia = message.kind === "image" || message.kind === "album";
  // 0032: reactions + reply (only where the page provides them).
  const actions = useMessageActions();
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const longPress = useLongPress(() => {
    if (actions) setPickerOpen(true);
  });
  const align = isMine ? "end" : "start";
  const viewer = useContext(ProductCardViewerContext);

  return (
    <div
      data-message-id={message.id}
      className={cn("group/msg flex flex-col", isMine ? "items-end" : "items-start", firstInGroup ? "mt-3" : "mt-0.5")}
    >
      {firstInGroup && senderLabel && (
        <p
          className={cn(
            "text-muted-foreground mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold",
            isMine && "justify-end text-right",
          )}
          data-sender-label
        >
          {senderIcon}
          {senderLabel}
        </p>
      )}

      <div
        {...(actions ? longPress : {})}
        className={cn(
          "relative flex w-full items-center gap-1 [-webkit-touch-callout:none]",
          isMine ? "flex-row-reverse" : "flex-row",
        )}
      >
      {message.kind === "payment" && message.payment ? (
        <PaymentCard
          card={message.payment}
          orderNumber={message.orderNumber}
          messageId={message.id}
          received={message.paymentReceived ?? null}
        />
      ) : message.kind === "slip" && message.order ? (
        // 0033: an order inside the customer's conversation.
        <OrderSlipCard order={message.order} createdAt={message.createdAt} isMine={isMine} viewer={viewer} />
      ) : message.kind === "slip" ? (
        <OrderPlacedCard slip={slip ?? { orderNumber, robloxUsername: null, total: null }} isMine={isMine} />
      ) : message.kind === "product" && message.product ? (
        <ProductRecommendationCard card={message.product} messageId={message.id} createdAt={message.createdAt} isMine={isMine} />
      ) : message.kind === "vouch" && message.vouch ? (
        <VouchRequestCard request={message.vouch} isMine={isMine} />
      ) : message.kind === "album" && message.album ? (
        <AlbumMessage message={message} isMine={isMine} onOpenMedia={onOpenMedia} onMediaLoad={onMediaLoad} />
      ) : message.kind === "image" && message.hasAttachment ? (
        <SingleImage message={message} isMine={isMine} onOpenMedia={onOpenMedia} onMediaLoad={onMediaLoad} />
      ) : (
        <div
          className={cn(
            "max-w-[85%] overflow-hidden px-3.5 py-2 text-[15px] leading-relaxed sm:max-w-[75%] sm:text-sm",
            bubbleShape(isMine, firstInGroup, lastInGroup),
            isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {message.replyTo && actions && (
            <QuoteBlock
              quote={message.replyTo}
              isMine={isMine}
              label={actions.quoteLabel(message.replyTo)}
              onJump={() => actions.jumpTo(message.replyTo!.id)}
            />
          )}
          <p className="break-words whitespace-pre-wrap">{message.body}</p>
        </div>
      )}
      {actions && <HoverActions onOpenPicker={() => setPickerOpen(true)} onReply={() => actions.reply(message)} />}
      {actions && pickerOpen && (
        <ReactionPicker
          mine={message.reactions?.mine ?? null}
          align={align}
          onPick={(reaction) => actions.react(message.id, reaction)}
          onReply={() => actions.reply(message)}
          onClose={closePicker}
        />
      )}
      </div>

      {isMedia && message.body && (
        <p
          className={cn(
            "mt-1 max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap sm:max-w-[75%] sm:text-sm",
            isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {message.body}
        </p>
      )}

      {actions && (
        <ReactionChips reactions={message.reactions ?? null} align={align} onToggle={(reaction) => actions.react(message.id, reaction)} />
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

/** Compact structured "order placed" card (the full slip text stays for legacy Messenger only). */
function OrderPlacedCard({ slip, isMine }: { slip: SlipInfo; isMine: boolean }) {
  return (
    <div
      className={cn(
        "border-border bg-background w-full max-w-[17rem] rounded-2xl border px-3.5 py-3 text-left shadow-sm",
        isMine ? "ml-auto" : "",
      )}
    >
      <p className="text-primary inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
        <ReceiptText className="size-3.5" /> Order placed
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {slip.robloxUsername && (
          <>
            <dt className="text-muted-foreground">Roblox</dt>
            <dd className="truncate font-semibold">{slip.robloxUsername}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Order</dt>
        <dd className="font-semibold [font-variant-numeric:tabular-nums]">{slip.orderNumber}</dd>
        {slip.total !== null && (
          <>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold">{formatPrice(slip.total)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function tileAspect(width: number | null, height: number | null) {
  if (!width || !height) return undefined;
  // Very tall screenshots are capped so one image never fills the screen.
  return `${width} / ${Math.min(height, width * 1.6)}`;
}

/** One photo: a clean rounded tile, natural aspect ratio, no coloured bubble. */
function SingleImage({
  message,
  isMine,
  onOpenMedia,
  onMediaLoad,
}: {
  message: ChatMessageDto;
  isMine: boolean;
  onOpenMedia: OpenMedia;
  onMediaLoad: () => void;
}) {
  const full = `/api/order-chat/attachments/${message.id}`;
  return (
    <button
      type="button"
      onClick={() => onOpenMedia([{ src: full, alt: "Photo" }], 0)}
      className={cn("bg-muted block overflow-hidden rounded-2xl", isMine ? "ml-auto" : "")}
      aria-label="View photo"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked redirect */}
      <img
        src={full}
        alt="Photo"
        loading="lazy"
        onLoad={onMediaLoad}
        className="block h-auto max-h-80 w-auto max-w-[min(16rem,72vw)] object-cover"
      />
    </button>
  );
}

/** Several photos sent together: one compact gallery (2, 3, 2x2, or 2x2 with "+N"). */
function AlbumMessage({
  message,
  isMine,
  onOpenMedia,
  onMediaLoad,
}: {
  message: ChatMessageDto;
  isMine: boolean;
  onOpenMedia: OpenMedia;
  onMediaLoad: () => void;
}) {
  const album = message.album!;
  const items = album.items;
  const layout = albumLayout(items.length);
  const { title, countText } = albumCaption(album);
  const viewerItems = items.map((item, index) => ({
    src: mediaSrc(item.id, "full"),
    alt: `${title ?? "Photo"} ${index + 1} of ${items.length}`,
  }));
  const open = (index: number) => onOpenMedia(viewerItems, index);
  const shown = items.slice(0, layout.shown);

  return (
    <div className={cn("w-[min(16.5rem,74vw)]", isMine ? "ml-auto" : "")} data-album-count={items.length}>
      {(title || countText) && (
        <p className={cn("mb-1 flex items-baseline gap-1.5 px-1 text-xs", isMine && "justify-end")}>
          {title && (
            <span className="text-foreground inline-flex items-center gap-1 font-semibold">
              <BadgeCheck className="text-primary size-3.5" /> {title}
            </span>
          )}
          {countText && <span className="text-muted-foreground">{countText}</span>}
        </p>
      )}
      {layout.pattern === "single" ? (
        <button
          type="button"
          onClick={() => open(0)}
          className="bg-muted block w-full overflow-hidden rounded-2xl"
          aria-label="View photo"
          style={{ aspectRatio: tileAspect(items[0].width, items[0].height) ?? "4 / 5" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked redirect */}
          <img src={mediaSrc(items[0].id, "thumb")} alt={viewerItems[0].alt} loading="lazy" onLoad={onMediaLoad} className="size-full object-cover" />
        </button>
      ) : (
        <div
          className={cn(
            "grid gap-0.5 overflow-hidden rounded-2xl",
            layout.pattern === "pair" ? "grid-cols-2" : "grid-cols-2 grid-rows-2",
          )}
          style={{ aspectRatio: layout.pattern === "pair" ? "2 / 1.25" : "1 / 1" }}
        >
          {shown.map((item, index) => {
            const isOverflowTile = layout.overflow > 0 && index === layout.shown - 1;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => open(index)}
                className={cn(
                  "bg-muted relative block overflow-hidden",
                  layout.pattern === "feature" && index === 0 && "row-span-2",
                )}
                aria-label={isOverflowTile ? `View all ${items.length} photos` : `View photo ${index + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked redirect */}
                <img src={mediaSrc(item.id, "thumb")} alt={viewerItems[index].alt} loading="lazy" onLoad={onMediaLoad} className="size-full object-cover" />
                {isOverflowTile && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xl font-bold text-white">
                    +{layout.overflow + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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
  const isAlbum = item.kind === "album";
  const previews = item.previews ?? [];
  const layout = albumLayout(previews.length);

  return (
    <div className="mt-0.5 flex flex-col items-end" data-pending-id={item.clientMessageId}>
      {isAlbum ? (
        <div className={cn("w-[min(16.5rem,74vw)]", failed ? "opacity-70" : "opacity-85")}>
          {item.label && (
            <p className="mb-1 flex justify-end gap-1.5 px-1 text-xs font-semibold">
              <BadgeCheck className="text-primary size-3.5" /> {ALBUM_LABEL_TEXT[item.label]}
            </p>
          )}
          <div
            className={cn(
              "relative grid gap-0.5 overflow-hidden rounded-2xl",
              layout.pattern === "single" ? "grid-cols-1" : layout.pattern === "pair" ? "grid-cols-2" : "grid-cols-2 grid-rows-2",
            )}
            style={{ aspectRatio: layout.pattern === "single" ? "4 / 5" : layout.pattern === "pair" ? "2 / 1.25" : "1 / 1" }}
          >
            {previews.slice(0, layout.shown).map((url, index) => (
              <div
                key={url}
                className={cn("bg-muted relative overflow-hidden", layout.pattern === "feature" && index === 0 && "row-span-2")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={url} alt="" className="size-full object-cover" />
                {layout.overflow > 0 && index === layout.shown - 1 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xl font-bold text-white">
                    +{layout.overflow + 1}
                  </span>
                )}
              </div>
            ))}
            {!failed && (
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                <div className="h-full bg-white transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </div>
            )}
          </div>
          {item.body && (
            <p className="bg-primary text-primary-foreground mt-1 rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap sm:text-sm">
              {item.body}
            </p>
          )}
        </div>
      ) : (
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
          {item.replyTo && (
            <span className="border-primary-foreground/70 bg-primary-foreground/15 mb-1 block rounded-lg border-l-2 px-2.5 py-1 text-xs">
              <span className="block font-semibold">{item.replyTo.senderLabel}</span>
              <span className="text-primary-foreground/85 line-clamp-2 break-words">{item.replyTo.preview}</span>
            </span>
          )}
          {item.body && <p className="break-words whitespace-pre-wrap">{item.body}</p>}
        </div>
      )}
      {failed ? (
        <div className="text-destructive mt-1 max-w-[85%] px-1 text-[11px] font-medium">
          <div className="flex items-center justify-end gap-2">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{item.error ?? "Not sent."}</span>
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <RotateCcw className="size-3" /> Retry
            </button>
            <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 underline-offset-2 hover:underline" aria-label="Remove unsent message">
              <X className="size-3" />
            </button>
          </div>
          {item.failedFiles.length > 0 && (
            <ul className="mt-0.5 text-right" aria-label="Images that failed">
              {item.failedFiles.map((file) => (
                <li key={file.position}>
                  Image {file.position + 1} ({file.name}): {file.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground mt-1 flex items-center gap-2 px-1 text-[11px]">
          <p aria-live="polite">
            {isAlbum
              ? uploadProgressText({ completed: item.uploaded, total: previews.length })
              : item.kind === "image"
                ? `Uploading ${Math.round(item.progress * 100)}%…`
                : "Sending…"}
          </p>
          {isAlbum && item.uploaded < previews.length && (
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold underline-offset-2 hover:underline"
              aria-label="Cancel sending these photos"
            >
              <X className="size-3" /> Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
