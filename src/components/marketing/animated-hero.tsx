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
        className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pt-24 pb-16 text-center sm:pt-32 sm:pb-20"
      >
        <motion.div
          variants={item}
          className="border-border/60 text-muted-foreground mb-8 flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium"
        >
          <span className="relative flex size-1.5">
            <span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-75" />
            <span className="bg-primary relative inline-flex size-1.5 rounded-full" />
          </span>
          Now accepting orders
        </motion.div>

        <motion.h1
          variants={item}
          className="font-heading max-w-3xl text-5xl font-semibold tracking-[-0.03em] text-balance sm:text-7xl"
        >
          Buy gamepasses. Skip overpriced stores.
        </motion.h1>

        <motion.p
          variants={item}
          className="text-muted-foreground mt-7 max-w-lg text-lg text-balance sm:text-xl"
        >
          A digital marketplace for discounted in-game currency, gamepasses,
          and subscriptions — built for gamers who expect a real storefront.
        </motion.p>

        <motion.div
          variants={item}
          className="mt-11 flex flex-col gap-3 sm:flex-row"
        >
          <Button size="lg" asChild className="h-12 px-7 text-[15px]">
            <Link href="/games">
              Browse games
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="h-12 px-7 text-[15px]"
          >
            <Link href="/#how-it-works">How it works</Link>
          </Button>
        </motion.div>
      </motion.div>
    </section>
  );
}
