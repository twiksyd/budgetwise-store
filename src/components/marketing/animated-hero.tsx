"use client";

import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function AnimatedHero() {
  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto flex max-w-6xl flex-col items-center px-6 pt-24 pb-20 text-center sm:pt-32"
    >
      <motion.div variants={item}>
        <Badge variant="secondary" className="mb-6">
          Now accepting orders
        </Badge>
      </motion.div>
      <motion.h1
        variants={item}
        className="font-heading max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
      >
        Premium prices for your favorite games.
      </motion.h1>
      <motion.p
        variants={item}
        className="text-muted-foreground mt-6 max-w-xl text-lg text-balance"
      >
        BudgetWise is a digital marketplace for discounted in-game currency,
        gamepasses, and subscriptions — built for gamers who expect a real
        storefront, not a spreadsheet.
      </motion.p>
      <motion.div
        variants={item}
        className="mt-10 flex flex-col gap-3 sm:flex-row"
      >
        <Button size="lg" asChild>
          <Link href="/games">
            Browse games
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/#how-it-works">How it works</Link>
        </Button>
      </motion.div>
    </motion.section>
  );
}
