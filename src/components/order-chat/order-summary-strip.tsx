"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Package } from "lucide-react";
import type { SummaryLine } from "@/lib/chat/order-summary.mjs";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Two thumbnails + "+N" keep "34 items · ₱4,826" readable on a 360 px phone.
const PREVIEW_THUMBS = 2;

function Thumb({ line, index, size }: { line: SummaryLine; index: number; size: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "bg-muted border-border/60 flex shrink-0 items-center justify-center overflow-hidden rounded-lg border",
        "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none",
        size === "sm" ? "size-9" : "size-12",
      )}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      {line.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
        <img src={line.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="text-muted-foreground text-[10px] font-bold uppercase">{line.productName.slice(0, 2)}</span>
      )}
    </div>
  );
}

/**
 * "Your order · 8 items · ₱1,240  [img][img][img][+5]  View items".
 * Pinned above the conversation (it is not a chat message). Collapsed by
 * default so the latest messages stay in view; expands in place with a
 * bounded height, never pushing the chat off screen.
 */
export function OrderSummaryStrip({
  lines,
  itemCount,
  total,
  defaultOpen = false,
}: {
  lines: SummaryLine[];
  itemCount: number;
  total: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const extra = Math.max(0, lines.length - PREVIEW_THUMBS);

  return (
    <section className="border-border/60 bg-background border-b" aria-label="Your order">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left sm:px-4"
      >
        <div className="min-w-0 flex-1 shrink-0">
          <p className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
            <Package className="size-3.5" /> Your order
          </p>
          <p className="text-sm font-semibold whitespace-nowrap">
            {itemCount} item{itemCount === 1 ? "" : "s"} · {formatPrice(total)}
          </p>
        </div>
        {!open && (
          <div className="flex items-center gap-1" aria-hidden>
            {lines.slice(0, PREVIEW_THUMBS).map((line, index) => (
              <Thumb key={line.lineIndex} line={line} index={index} size="sm" />
            ))}
            {extra > 0 && (
              <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg text-xs font-bold">
                +{extra}
              </span>
            )}
          </div>
        )}
        <span className="text-primary inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold whitespace-nowrap">
          {open ? "Collapse" : "View items"}
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </span>
      </button>

      {open && (
        <ul className="max-h-[45vh] space-y-2 overflow-y-auto overscroll-contain px-3 pb-3 sm:px-4" aria-label="Order items">
          {lines.map((line, index) => (
            <li key={line.lineIndex} className="bg-muted/40 flex items-center gap-3 rounded-xl p-2">
              <Thumb line={line} index={index} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{line.productName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {line.gameName}
                  {line.robuxAmount ? ` · ${line.robuxAmount.toLocaleString()} Robux` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{formatPrice(line.lineTotal)}</p>
                <p className={cn("text-xs", line.quantity > 1 ? "text-primary font-semibold" : "text-muted-foreground")}>
                  Qty {line.quantity}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
