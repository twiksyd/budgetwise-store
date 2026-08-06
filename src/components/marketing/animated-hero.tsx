"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroBanner } from "@/components/marketing/hero-banner";
import { useStoreStatus } from "@/components/shared/store-status-provider";
import { cn } from "@/lib/utils";

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.05 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

// Same three-way palette as the sitewide status banner (amber for
// maintenance, destructive red for closed) so the hero badge never tells a
// different story than the banner above it — the exact contradiction the
// original hardcoded "LIVE" badge caused.
const badgeConfig = {
  open: {
    label: "Now Accepting Orders",
    eyebrow: "Live",
    dotClassName: "bg-emerald-500",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_24px_-12px_rgba(16,185,129,0.35)] dark:text-emerald-400",
    eyebrowClassName: "text-emerald-600 dark:text-emerald-400",
    pulse: true,
  },
  maintenance: {
    label: "Ordering Paused for Maintenance",
    eyebrow: "Paused",
    dotClassName: "bg-amber-500",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    eyebrowClassName: "text-amber-600 dark:text-amber-400",
    pulse: false,
  },
  closed: {
    label: "Temporarily Closed",
    eyebrow: "Closed",
    dotClassName: "bg-destructive",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    eyebrowClassName: "text-destructive",
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
        className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pt-8 pb-6 text-center sm:pt-32 sm:pb-20"
      >
        <motion.div
          variants={item}
          className={cn(
            "mb-5 flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-[13px] font-semibold sm:mb-8 sm:text-sm",
            badge.className,
          )}
        >
          <motion.span
            animate={badge.pulse ? { opacity: [1, 0.45, 1] } : undefined}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className={cn("size-2 shrink-0 rounded-full", badge.dotClassName)}
          />
          <span className={cn("font-bold tracking-wide uppercase", badge.eyebrowClassName)}>
            {badge.eyebrow}
          </span>
          <span className="opacity-40">•</span>
          {badge.label}
        </motion.div>

        <motion.h1
          variants={item}
          className="font-heading max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-7xl"
        >
          Buy gamepasses. Skip overpriced stores.
        </motion.h1>

        <motion.p
          variants={item}
          className="text-muted-foreground mt-3 max-w-lg text-base text-balance sm:mt-7 sm:text-xl"
        >
          A digital marketplace for discounted in-game currency, gamepasses,
          and subscriptions — built for gamers who expect a real storefront.
        </motion.p>

        <motion.div
          variants={item}
          className="mt-5 flex flex-col gap-2 sm:mt-11 sm:flex-row sm:gap-3"
        >
          <Button size="lg" asChild className="h-11 px-7 text-[15px] sm:h-12">
            <Link href="/games">
              Browse games
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="h-11 px-7 text-[15px] sm:h-12"
          >
            <Link href="/how-ordering-works">How it works</Link>
          </Button>
        </motion.div>
      </motion.div>
    </section>
  );
}
