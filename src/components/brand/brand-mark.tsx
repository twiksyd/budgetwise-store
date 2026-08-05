import Image from "next/image";
import { cn } from "@/lib/utils";

// The official BudgetWise lockup (public/icons/NOBGbanner.png) — the full
// "BW / BudgetWise / Discounted Game Market" mark, transparent background.
// This is the ONLY logo used across the site (header, footer, mobile nav):
// no separate "BW"-only mark, no adjacent text label — the wordmark is
// baked into the artwork itself. Sized by height with width auto-derived
// from the source's own content aspect ratio so it's never stretched;
// object-contain only, never cropped.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-11 shrink-0 [aspect-ratio:1264/800]",
        className,
      )}
    >
      <Image
        src="/icons/NOBGbanner.png"
        alt="BudgetWise"
        fill
        sizes="140px"
        className="object-contain"
        priority
      />
    </span>
  );
}
