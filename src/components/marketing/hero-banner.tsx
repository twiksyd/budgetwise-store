import Image from "next/image";

// The hero's backdrop, all static and decorative:
//   1. the BudgetWise logo, pre-blurred into a soft brand texture
//      (public/images/hero-logo-blur.webp, made from icons/budgetwise-logo.png),
//      centered behind the headline so its purple and gold show through;
//   2. the lavender glow on top, tying it to the purple headline.
// Clipped to the hero (overflow-hidden + a fade at the bottom) so it never
// reaches the header or the game section. No CSS blur or motion at runtime.
// Opacity is set by measured contrast under the headline (worst pixel, peak
// glow): light 34% keeps the purple phrase ≥4:1, dark 15% ≥3:1 (large-text
// AA); dark is lower because the logo's white outline brightens the backdrop.
export function HeroBanner() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]"
    >
      <Image
        src="/images/hero-logo-blur.webp"
        alt=""
        width={600}
        height={340}
        priority
        unoptimized
        className="absolute top-[45%] left-1/2 w-[min(135%,46rem)] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.34] select-none sm:w-[min(92%,52rem)] dark:opacity-[0.15]"
      />
      <div className="hero-glow absolute inset-0" />
    </div>
  );
}
