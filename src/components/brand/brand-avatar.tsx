"use client";

import { useState } from "react";
import { Headset } from "lucide-react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * BudgetWise support's avatar in the customer chat: the official logo
 * (siteConfig.logo) on a dark disc so its light lettering reads. If the
 * image cannot load, a neutral support icon takes its place — the chat never
 * shows a broken image.
 */
export function BrandAvatar({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#17112b] ring-1 ring-black/5",
        className,
      )}
      aria-hidden
    >
      {failed ? (
        <Headset className="size-1/2 text-white/85" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static brand asset, no optimisation needed
        <img
          src={siteConfig.logo.src}
          alt=""
          width={siteConfig.logo.width}
          height={siteConfig.logo.height}
          decoding="async"
          onError={() => setFailed(true)}
          // The image can fail before React attaches onError (cached 404,
          // prerendered HTML): check once it is in the document too.
          ref={(image) => {
            if (image && image.complete && image.naturalWidth === 0) setFailed(true);
          }}
          className="h-auto w-[88%] max-w-none object-contain"
          data-brand-avatar
        />
      )}
    </span>
  );
}
