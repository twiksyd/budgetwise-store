import Image from "next/image";
import { cn } from "@/lib/utils";

// The official BudgetWise icon mark (public/icons/NOBGLogo.png) — the "BW"
// crown mark, transparent background, no wordmark baked in. Paired with a
// real "BudgetWise" text label (and slogan) at each call site rather than
// relying on image-baked text, so the slogan can live there too. Sized by
// height with width auto-derived from the source's own content aspect
// ratio so it's never stretched; object-contain only, never cropped.
// Decorative (empty alt) — every call site pairs this with visible
// "BudgetWise" text that carries the accessible name.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-11 shrink-0 [aspect-ratio:1072/696]",
        className,
      )}
    >
      <Image
        src="/icons/NOBGLogo.png"
        alt=""
        fill
        sizes="100px"
        className="object-contain"
        priority
      />
    </span>
  );
}
