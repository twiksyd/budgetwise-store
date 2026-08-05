// A diagonal "unavailable" banner across a game card's artwork — sized to
// always overshoot the container (200% width, centered) so it reads
// correctly across both the square catalog card and the wider featured
// card, without needing per-aspect-ratio tuning.
export function UnavailableRibbon() {
  return (
    <div className="absolute top-[16%] left-1/2 w-[200%] -translate-x-1/2 -rotate-45 bg-neutral-600 py-1.5 text-center text-[10px] font-bold tracking-[0.15em] text-white shadow-md sm:text-xs">
      UNAVAILABLE
    </div>
  );
}
