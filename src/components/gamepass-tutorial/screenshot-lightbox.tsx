"use client";

import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type LightboxImage = { src: string; alt: string; width: number; height: number };

export function ScreenshotLightbox({
  image,
  open,
  onOpenChange,
}: {
  image: LightboxImage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm duration-150",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center overflow-auto p-4 outline-none sm:p-8",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-150",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {image?.alt}
          </DialogPrimitive.Title>
          {image && (
            <div className="relative m-auto max-h-full max-w-full">
              {/* Real width/height (not a fixed placeholder) so the browser
                  reserves the correct box for this specific screenshot's
                  aspect ratio immediately, whether it's a wide Studio menu
                  or a tall, narrow dashboard sidebar. */}
              <Image
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                sizes="92vw"
                className="max-h-[90vh] w-auto max-w-[92vw] rounded-xl object-contain shadow-2xl"
              />
            </div>
          )}
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className="fixed top-4 right-4 z-50 flex size-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:ring-3 focus-visible:ring-white/50 focus-visible:outline-none sm:top-6 sm:right-6"
            >
              <XIcon className="size-5" />
              <span className="sr-only">Close</span>
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
