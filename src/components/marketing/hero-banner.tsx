"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";

const BANNER_SRC = "/icons/bw-banner.png";

// The uploaded banner as premium hero artwork — kept recognizable (only a
// light 9px blur, not the heavy multi-layer treatment this used to have),
// with a dark theme-aware overlay doing the work of keeping text readable
// instead of hiding the art. Fades into the section below via a mask, and
// drifts a few px on scroll for a barely-there parallax.
export function HeroBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 40]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_70%,transparent_100%)]"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        style={{ y }}
        className="absolute inset-x-0 -top-12 -bottom-12"
      >
        <Image
          src={BANNER_SRC}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover blur-[9px]"
        />
      </motion.div>

      {/* Dark, theme-aware overlay — this carries readability, not the blur */}
      <div className="bg-background/72 absolute inset-0" />

      {/* Soft radial light behind the headline, same language as every other section */}
      <div className="hero-glow absolute inset-0" />
    </div>
  );
}
