import { cn } from "@/lib/utils";

// Faithful-in-miniature nod to the BudgetWise crest: a hexagon badge with
// the same silver "B" / gold "W" split as the real logo. Swap for the
// official raster mark (once it's placed in the repo, e.g.
// public/brand/mark.png) for pixel-perfect fidelity — this keeps
// navigation/footer on-brand in the meantime.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-7 shrink-0 items-center justify-center gap-px bg-[linear-gradient(155deg,color-mix(in_oklch,var(--primary)_92%,black_15%),color-mix(in_oklch,var(--primary)_65%,black_45%))] font-heading text-[13px] font-extrabold [clip-path:polygon(25%_6%,75%_6%,100%_50%,75%_94%,25%_94%,0%_50%)]",
        className,
      )}
    >
      <span className="text-[oklch(0.95_0.005_291)]">B</span>
      <span className="text-gold">W</span>
    </span>
  );
}
