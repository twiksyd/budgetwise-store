"use client";

import { motion, type Variants } from "framer-motion";
import { GameCard } from "@/components/catalog/game-card";
import type { StoreGame } from "@/types/database";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function GameGrid({ games }: { games: StoreGame[] }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
    >
      {games.map((game) => (
        <motion.div key={game.id} variants={item}>
          <GameCard game={game} />
        </motion.div>
      ))}
    </motion.div>
  );
}
