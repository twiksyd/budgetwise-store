import { cn } from "@/lib/utils";

// Shown instead of a broken/missing image when a game has no icon_url yet —
// a soft, color-tinted monogram rather than a generic icon, so each game
// still reads as its own card rather than all missing-thumbnail games
// looking identical. Never an <img>, so there's no stretch/distortion risk
// and no broken-image icon while artwork is pending in the source inventory.
export function GameArtworkFallback({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden
      className={cn(
        "font-heading pointer-events-none absolute inset-0 flex items-center justify-center font-bold select-none",
        className,
      )}
      style={{ color: color ?? "var(--muted-foreground)" }}
    >
      {letter}
    </span>
  );
}
