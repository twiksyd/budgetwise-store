"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroBanner } from "@/components/marketing/hero-banner";
import { useStoreStatus } from "@/components/shared/store-status-provider";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
};

// Headline: each word rises from behind its own mask, one after another.
const words: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const word: Variants = {
  hidden: { y: "110%", rotate: 4 },
  show: { y: "0%", rotate: 0, transition: { duration: 0.9, ease: EASE } },
};

function MaskedHeadline({ text, className }: { text: string; className?: string }) {
  return (
    <motion.span variants={words} className={cn("inline", className)}>
      {text.split(" ").map((part, index) => (
        <span key={index} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span variants={word} className="inline-block origin-bottom-left will-change-transform">
            {part}
            {"\u00a0"}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

// Same three-way palette as the sitewide status banner (amber for
// maintenance, destructive red for closed) so the hero badge never tells a
// different story than the banner above it — the exact contradiction the
// original hardcoded "LIVE" badge caused.
const badgeConfig = {
  open: {
    label: "Open for orders",
    dotClassName: "bg-emerald-500",
    className: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400",
    pulse: true,
  },
  maintenance: {
    label: "Paused for maintenance",
    dotClassName: "bg-amber-500",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    pulse: false,
  },
  closed: {
    label: "Temporarily closed",
    dotClassName: "bg-destructive",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    pulse: false,
  },
} as const;

export function AnimatedHero() {
  const status = useStoreStatus();
  const badge = badgeConfig[status];

  return (
    <section className="relative overflow-hidden">
      <HeroBanner />
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-5 pt-14 pb-8 text-center sm:px-6 sm:pt-24 sm:pb-16"
      >
        <motion.div
          variants={item}
          className={cn(
            "mb-4 flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium sm:mb-7 sm:text-sm",
            badge.className,
          )}
        >
          <span className={cn("relative size-1.5 shrink-0 rounded-full", badge.dotClassName, badge.pulse && "bw-ping")} />
          {badge.label}
        </motion.div>

        <motion.h1
          variants={words}
          // ≈38px at 360, 41px at 390, 46px at 430 (≈13% up from before),
          // capped so "Buy gamepasses." always fits its own line; the second
          // phrase then wraps naturally into "Skip overpriced / stores."
          className="font-heading max-w-[17ch] text-[clamp(2.25rem,10.6vw,2.875rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:max-w-3xl sm:text-7xl sm:leading-[1.05]"
        >
          {/* Each word carries its own trailing space; each phrase starts
              its own line, so "Skip" never strands at the end of the first. */}
          <MaskedHeadline text="Buy gamepasses." />
          <br />
          {/* Same deep purple as the "Umorder Na" button it sits above. */}
          <MaskedHeadline text="Skip overpriced stores." className="text-primary" />
        </motion.h1>

        <motion.div
          variants={item}
          // Phones: one centered stack — the purple action, then the guide
          // as a quiet link right under it. Wider screens: side by side.
          className="mt-6 flex flex-col items-center gap-1 sm:mt-10 sm:flex-row sm:gap-3"
        >
          <Button
            asChild
            // Restrained depth: a soft purple shadow that tightens and a
            // 1px press when tapped.
            className="h-11 w-[188px] text-[15px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_20px_-8px_color-mix(in_oklch,var(--primary)_60%,transparent)] transition-[transform,box-shadow,background-color] duration-150 active:translate-y-px active:scale-[0.98] active:shadow-[0_1px_2px_rgba(0,0,0,0.1),0_3px_8px_-4px_color-mix(in_oklch,var(--primary)_55%,transparent)] sm:w-auto sm:px-6"
          >
            <Link href="/games">
              {status === "open" ? "Umorder Na" : "Tingnan ang Games"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Link
            href="/how-ordering-works"
            className="text-muted-foreground hover:text-foreground inline-flex h-11 items-center px-4 text-sm font-medium transition-colors"
          >
            Paano Umorder
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
