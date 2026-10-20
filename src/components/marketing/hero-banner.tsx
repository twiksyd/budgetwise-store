"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import bannerSrc from "../../../public/icons/budgetwise-logo.png";

const BANNER_SRC = bannerSrc;

// Hero backdrop, back to front:
//   a fine dot grid that fades out toward the edges (structure, not fog);
//   two brand-colour light fields that drift very slowly (CSS, transform-only);
//   the BudgetWise mark as a large watermark that sinks and grows on scroll.
// Everything is static for reduced motion.
export function HeroBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 140]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.12]);
  const fade = useTransform(scrollYProgress, [0, 0.9], [1, reduce ? 1 : 0.2]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]"
    >
      <div className="bw-hero-grid absolute inset-0" />
      <div className="bw-hero-field bw-hero-field-a" />
      <div className="bw-hero-field bw-hero-field-b" />

      <motion.div style={{ y, scale, opacity: fade }} className="absolute inset-x-0 -top-12 -bottom-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          <Image
            src={BANNER_SRC}
            alt=""
            fill
            priority
            quality={90}
            sizes="100vw"
            className="object-contain opacity-[0.22] blur-[3px] dark:opacity-[0.16]"
          />
        </motion.div>
      </motion.div>

      <div className="bg-background/40 absolute inset-0" />
    </div>
  );
}
