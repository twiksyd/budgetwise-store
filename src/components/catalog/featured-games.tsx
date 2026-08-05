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

// Mobile: horizontal snap-scroll carousel, each card ~85% of the viewport
// so the next card peeks at the edge. Desktop: 2-column grid; when there's
// an odd one out, the last card spans both columns as a wide hero card
// instead of leaving an awkward gap.
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
        className="-mx-6 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {games.map((game, i) => {
          const isWideLast =
            i === games.length - 1 && games.length % 2 === 1 && games.length > 1;
          return (
            <motion.div
              key={game.id}
              variants={item}
              className={cn(
                "w-[85%] shrink-0 snap-center sm:w-auto",
                isWideLast && "sm:col-span-2",
              )}
            >
              <FeaturedGameCard
                game={game}
                productCount={productCounts[game.id] ?? 0}
                wide={isWideLast}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
