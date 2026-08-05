"use client";

import { motion, type Variants } from "framer-motion";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import type { ProductBadgeValue } from "@/components/catalog/product-badge";
import { getBestValueId, getConfiguredBadge } from "@/lib/merchandising";
import {
  groupByCategory,
  PRODUCT_CATEGORY_ICONS,
  PRODUCT_CATEGORY_LABELS,
} from "@/lib/product-category";
import type { StoreGamepass } from "@/types/database";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
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
  const sections = groupByCategory(gamepasses);

  return (
    <div className="mt-10 flex flex-col gap-10">
      {sections.map(({ category, items }) => {
        const SectionIcon = PRODUCT_CATEGORY_ICONS[category];

        return (
          <section key={category}>
            <div className="flex items-center gap-2">
              <SectionIcon className="text-muted-foreground size-4" />
              <h2 className="font-heading text-sm font-semibold">
                {PRODUCT_CATEGORY_LABELS[category]}
              </h2>
            </div>

            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {items.map((gamepass) => {
                const isBestValue = gamepass.id === bestValueId;
                const badge: ProductBadgeValue | null = isBestValue
                  ? "best-value"
                  : (getConfiguredBadge(gamepass.id) ??
                    (category === "limited" ? "limited" : null));

                return (
                  <motion.div key={gamepass.id} variants={item}>
                    <GamepassCard
                      gamepass={gamepass}
                      gameId={gameId}
                      gameSlug={gameSlug}
                      gameName={gameName}
                      category={category}
                      badge={badge}
                      featured={isBestValue}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          </section>
        );
      })}
    </div>
  );
}
