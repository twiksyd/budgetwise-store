"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { GameCard } from "@/components/catalog/game-card";
import type { StoreGame } from "@/types/database";

const EASE = [0.16, 1, 0.3, 1] as const;

// Each tile rises in as it scrolls into view, staggered across its row, and
// when a search or filter changes the set, tiles leave, enter and slide to
// their new places instead of jumping.
const item: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.97, filter: "blur(4px)" },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: EASE, delay: (index % 5) * 0.06 },
  }),
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } },
};

export function GameGrid({
  games,
  productCounts,
}: {
  games: StoreGame[];
  productCounts?: Record<string, number>;
}) {
  return (
    <div
      className="mt-6 grid grid-cols-2 gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-5 lg:grid-cols-5"
    >
      <AnimatePresence mode="popLayout">
        {games.map((game, index) => (
          <motion.div
            key={game.id}
            layout
            custom={index}
            variants={item}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "0px 0px -6% 0px" }}
            exit="exit"
            transition={{ layout: { duration: 0.45, ease: EASE } }}
          >
            <GameCard game={game} productCount={productCounts?.[game.id]} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
