"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import bannerSrc from "../../../public/icons/NOBGbanner-hero.webp";

const BANNER_SRC = bannerSrc;

// The official BudgetWise mark, transparent PNG, used as hero backdrop —
// branding, not decoration. Blurred at 13px (~20% of Tailwind's 64px max
// blur preset), slightly desaturated, and shown at reduced opacity so it
// reads as a large soft brand watermark behind the content rather than
// competing with it. Layering (back to front): banner -> dark overlay ->
// soft purple glow -> hero content. Fades into the section below via a
// mask, and drifts a few px on scroll for a barely-there parallax.
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
          quality={62}
          sizes="100vw"
          className="scale-150 object-contain opacity-80 blur-[13px] saturate-75 sm:scale-125"
        />
      </motion.div>

      {/* Dark, theme-aware overlay — sits on top of the banner */}
      <div className="bg-background/55 absolute inset-0" />

      {/* Soft purple ambient glow — above the overlay, below the content,
          intentionally faint so it never outshines the banner itself */}
      <div className="hero-glow absolute inset-0" />
    </div>
  );
}
