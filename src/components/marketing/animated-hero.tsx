"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroBanner } from "@/components/marketing/hero-banner";

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

export function AnimatedHero() {
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
          className="border-primary/25 bg-primary/10 text-primary mb-5 flex items-center gap-2.5 rounded-full border px-4 py-2 text-[13px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_24px_-12px_color-mix(in_oklch,var(--primary)_40%,transparent)] sm:mb-8 sm:text-sm"
        >
          <span className="relative flex size-2">
            <span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-75" />
            <span className="bg-primary relative inline-flex size-2 rounded-full" />
          </span>
          Now accepting orders
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
            <Link href="/#how-it-works">How it works</Link>
          </Button>
        </motion.div>
      </motion.div>
    </section>
  );
}
