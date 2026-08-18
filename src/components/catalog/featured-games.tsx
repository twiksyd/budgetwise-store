"use client";

import { motion, type Variants } from "framer-motion";
import { FeaturedGameCard } from "@/components/catalog/featured-game-card";
import { cn } from "@/lib/utils";
import type { StoreGame } from "@/types/database";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

function gridClassName(count: number) {
  if (count === 1) {
    return "mx-auto max-w-md grid-cols-1";
  }

  if (count === 2) {
    return "grid-cols-2 sm:grid-cols-2";
  }

  if (count === 3) {
    return "grid-cols-2 sm:grid-cols-3";
  }

  if (count === 4) {
    return "grid-cols-2 sm:grid-cols-4";
  }

  if (count <= 6) {
    return "grid-cols-2 sm:grid-cols-3";
  }

  return "grid-cols-2 sm:grid-cols-4";
}

export function FeaturedGames({
  games,
  productCounts,
}: {
  games: StoreGame[];
  productCounts: Record<string, number>;
}) {
  if (games.length === 0) return null;

  return (
    <section>
      <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
        Featured games
      </h2>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className={cn("mt-4 grid gap-3 sm:gap-4", gridClassName(games.length))}
      >
        {games.map((game) => (
          <motion.div key={game.id} variants={item}>
            <FeaturedGameCard
              game={game}
              productCount={productCounts[game.id] ?? 0}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
