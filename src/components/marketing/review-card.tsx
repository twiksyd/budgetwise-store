import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Review } from "@/types/review";

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
    </svg>
  );
}

export function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="surface-premium surface-premium-hover flex h-full flex-col gap-4 overflow-hidden rounded-xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                "size-3.5",
                i < review.rating
                  ? "fill-foreground text-foreground"
                  : "text-muted-foreground/25",
              )}
            />
          ))}
        </div>
        <span className="text-muted-foreground/70 flex shrink-0 items-center gap-1 text-[11px] font-medium">
          <FacebookGlyph className="size-3" />
          {review.platform}
        </span>
      </div>
      <p className="text-foreground/90 relative flex-1 text-sm leading-relaxed">
        “{review.text}”
      </p>
      <p className="font-heading text-sm font-semibold">{review.name}</p>
    </div>
  );
}
