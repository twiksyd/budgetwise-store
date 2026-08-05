"use client";

import { motion, type Variants } from "framer-motion";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import { getBestValueId, getConfiguredBadge } from "@/lib/merchandising";
import type { StoreGamepass } from "@/types/database";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function GamepassList({
  gamepasses,
  gameId,
  gameSlug,
  gameName,
}: {
  gamepasses: StoreGamepass[];
  gameId: string;
  gameSlug: string;
  gameName: string;
}) {
  const bestValueId = getBestValueId(gamepasses);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mt-10 flex flex-col gap-3"
    >
      {gamepasses.map((gamepass) => (
        <motion.div key={gamepass.id} variants={item}>
          <GamepassCard
            gamepass={gamepass}
            gameId={gameId}
            gameSlug={gameSlug}
            gameName={gameName}
            badge={
              getConfiguredBadge(gamepass.id) ??
              (gamepass.id === bestValueId ? "best-value" : null)
            }
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
