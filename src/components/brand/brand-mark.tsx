import Image from "next/image";
import { cn } from "@/lib/utils";

// The official BudgetWise mark (public/icons/bw-logo.png) — used everywhere
// the brand needs an icon-sized identity: header, footer, mobile nav.
// Sized by height with width auto-derived from the source's own aspect
// ratio (541x350, via aspect-ratio) so it's never stretched or distorted;
// object-contain only, never cropped. Decorative (empty alt) — every call
// site pairs this with a visible "BudgetWise" text label right next to it,
// which already carries the accessible name.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-8 shrink-0 overflow-hidden rounded-[7px] [aspect-ratio:541/350]",
        className,
      )}
    >
      <Image
        src="/icons/bw-logo.png"
        alt=""
        fill
        sizes="60px"
        className="object-contain"
        priority
      />
    </span>
  );
}
