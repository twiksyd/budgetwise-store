"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import bannerSrc from "../../../public/icons/budgetwise-logo.png";

const BANNER_SRC = bannerSrc;

// The official BudgetWise mark as a soft watermark behind the hero (same
// look as before: blurred, overlay, faint purple glow). It eases in on load
// and sinks / grows / fades as the page scrolls. Static for reduced motion.
export function HeroBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 140]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.12]);
  const fade = useTransform(scrollYProgress, [0, 0.9], [1, reduce ? 1 : 0.45]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_0%,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_70%,transparent_100%)]"
    >
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
            className="object-contain opacity-80 blur-[13px]"
          />
        </motion.div>
      </motion.div>

      <div className="bg-background/55 absolute inset-0" />
      <div className="hero-glow absolute inset-0" />
    </div>
  );
}
