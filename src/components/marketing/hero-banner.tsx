"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";

const BANNER_SRC = "/icons/bw-banner.png";

// Three stacked copies of the same image (the browser fetches it once and
// reuses it from cache — identical src/sizes/quality resolve to the same
// optimized URL), each blurred a different amount and revealed only where
// a CSS mask lets it show through. The result is a single image that reads
// as sharp at the edges/top and progressively softer toward the content
// zone, instead of one uniform blur — plain CSS/GPU compositing, no canvas.
export function HeroBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 50]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,black_68%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_68%,transparent_100%)]"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        style={{ y }}
        className="absolute inset-x-0 -top-16 -bottom-16"
      >
        {/* Layer A — sharp base. What edges and top actually show. */}
        <Image
          src={BANNER_SRC}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />

        {/* Layer B — medium blur halo, fades out before the true edges/top */}
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_85%_75%_at_50%_50%,black_0%,black_40%,transparent_92%)] [-webkit-mask-image:radial-gradient(ellipse_85%_75%_at_50%_50%,black_0%,black_40%,transparent_92%)]">
          <Image
            src={BANNER_SRC}
            alt=""
            fill
            sizes="100vw"
            className="object-cover blur-xl"
          />
        </div>

        {/* Layer C — heaviest blur, covers the headline-through-CTA band so the
            banner's own wordmark never reads as legible text behind ours */}
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_55%_52%_at_50%_52%,black_0%,black_48%,transparent_88%)] [-webkit-mask-image:radial-gradient(ellipse_55%_52%_at_50%_52%,black_0%,black_48%,transparent_88%)]">
          <Image
            src={BANNER_SRC}
            alt=""
            fill
            sizes="100vw"
            className="object-cover blur-[90px]"
          />
        </div>
      </motion.div>

      {/* Theme-aware veil for text contrast — bg-background flips light/dark automatically */}
      <div className="bg-background/60 absolute inset-0" />

      {/* Soft radial light behind the headline, same language as every other section */}
      <div className="hero-glow absolute inset-0" />
    </div>
  );
}
