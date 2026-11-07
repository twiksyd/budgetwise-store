"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { GameCard } from "@/components/catalog/game-card";
import { cn } from "@/lib/utils";
import type { StoreGame } from "@/types/database";

const EASE = [0.16, 1, 0.3, 1] as const;

// Each tile rises in as it scrolls into view, staggered across its row, and
// when a search or filter changes the set, tiles leave, enter and slide to
// their new places instead of jumping.
const EAGER_COUNT = 6;

const item: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: EASE, delay: (index % 5) * 0.04 },
  }),
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

export function GameGrid({
  games,
  productCounts,
  className,
  showCategory = true,
}: {
  games: StoreGame[];
  productCounts?: Record<string, number>;
  className?: string;
  showCategory?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-6 grid grid-cols-2 gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5",
        className,
      )}
    >
      <AnimatePresence mode="popLayout">
        {games.map((game, index) => (
          <motion.div
            key={game.id}
            layout
            custom={index}
            variants={item}
            // The first screen of cards is server-rendered visible (no
            // waiting on JavaScript to fade it in); the rest rise in on scroll.
            initial={index < EAGER_COUNT ? false : "hidden"}
            whileInView="show"
            viewport={{ once: true, margin: "0px 0px -6% 0px" }}
            exit="exit"
            transition={{ layout: { duration: 0.4, ease: EASE } }}
            className="h-full"
          >
            <GameCard
              game={game}
              productCount={productCounts?.[game.id]}
              priority={index < 4}
              showCategory={showCategory}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
