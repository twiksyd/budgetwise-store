"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ViewerItem {
  /** Full-size image (only ever loaded here, never in the chat). */
  src: string;
  alt: string;
}

/**
 * Full-screen image viewer for chat photos and albums: next/previous
 * (buttons, arrow keys, swipe), double-tap / double-click zoom with panning,
 * "3 / 8" counter. It is an overlay, so closing it leaves the chat exactly
 * where it was.
 */
export function MediaViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: ViewerItem[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && items.length > 0;
  const current = open ? items[Math.min(index!, items.length - 1)] : null;
  const [zoomed, setZoomed] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const many = items.length > 1;

  const go = useCallback(
    (delta: number) => {
      if (index === null || !many) return;
      setZoomed(false);
      onIndexChange((index + delta + items.length) % items.length);
    },
    [index, many, items.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  useEffect(() => setZoomed(false), [index]);

  // Preload the next image only (not the whole album).
  const nextSrc = open && many ? items[(index! + 1) % items.length]?.src : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[80] bg-black/90 duration-150",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[80] flex flex-col outline-none"
          aria-describedby={undefined}
          onTouchStart={(event) => {
            if (zoomed || event.touches.length !== 1) return;
            touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
          }}
          onTouchEnd={(event) => {
            const start = touch.current;
            touch.current = null;
            if (!start || zoomed) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          <DialogPrimitive.Title className="sr-only">{current?.alt ?? "Image"}</DialogPrimitive.Title>
          <div
            className="flex shrink-0 items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white"
          >
            <span className="min-w-12 text-sm font-semibold tabular-nums" aria-live="polite">
              {many && index !== null ? `${index + 1} / ${items.length}` : ""}
            </span>
            <DialogPrimitive.Close
              className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              aria-label="Close"
            >
              <XIcon className="size-5" />
            </DialogPrimitive.Close>
          </div>

          <div
            className={cn(
              "relative min-h-0 flex-1",
              zoomed ? "overflow-auto overscroll-contain" : "flex items-center justify-center overflow-hidden",
            )}
            onClick={(event) => {
              if (event.target === event.currentTarget && !zoomed) onClose();
            }}
          >
            {current && (
              // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked signed URL
              <img
                key={current.src}
                src={current.src}
                alt={current.alt}
                onDoubleClick={() => setZoomed((value) => !value)}
                className={cn(
                  "select-none",
                  zoomed
                    ? "max-w-none cursor-zoom-out"
                    : "max-h-full max-w-full cursor-zoom-in object-contain px-2",
                )}
                style={zoomed ? { width: "200%", height: "auto" } : undefined}
                draggable={false}
              />
            )}
            {nextSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- preload only
              <img src={nextSrc} alt="" aria-hidden className="hidden" />
            )}
          </div>

          {many && (
            <div className="flex shrink-0 items-center justify-center gap-6 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white">
              <button
                type="button"
                onClick={() => go(-1)}
                className="inline-flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={() => setZoomed((value) => !value)}
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/20"
              >
                {zoomed ? "Fit" : "Zoom"}
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="inline-flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label="Next image"
              >
                <ChevronRight className="size-6" />
              </button>
            </div>
          )}
          {!many && (
            <div className="flex shrink-0 justify-center px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setZoomed((value) => !value)}
                className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                {zoomed ? "Fit" : "Zoom"}
              </button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
