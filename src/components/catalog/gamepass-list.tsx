"use client";

import { motion, type Variants } from "framer-motion";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import type { ProductBadgeValue } from "@/components/catalog/product-badge";
import { getBestValueId, getConfiguredBadge } from "@/lib/merchandising";
import {
  groupByCategory,
  PRODUCT_CATEGORY_ICONS,
  PRODUCT_CATEGORY_LABELS,
  type ProductCategory,
} from "@/lib/product-category";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

function sectionChipClassName(category: ProductCategory): string {
  return category === "limited"
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : "bg-primary/10 text-primary";
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

const sectionDescriptions: Record<ProductCategory, string> = {
  currency: "Choose an in-game cash amount.",
  gamepasses: "Permanent upgrades and special access.",
  vip: "Premium access products with clear pricing.",
  bundle: "Grouped perks and multi-item offers.",
  limited: "Time-sensitive products and rotating offers.",
};

export function GamepassList({
  gamepasses,
  gameId,
  gameSlug,
  gameName,
  gameIconUrl = null,
  orderingDisabled = false,
  robloxIconUrls,
}: {
  gamepasses: StoreGamepass[];
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl?: string | null;
  orderingDisabled?: boolean;
  robloxIconUrls?: Map<string, string>;
}) {
  const bestValueId = getBestValueId(
    gamepasses.filter(
      (g) =>
        g.availability_status !== "out_of_stock" &&
        g.availability_status !== "coming_soon",
    ),
  );
  const sections = groupByCategory(gamepasses);

  return (
    <div className="mt-7 flex flex-col gap-8 sm:mt-12 sm:gap-14">
      {sections.map(({ category, items }, index) => {
        const SectionIcon = PRODUCT_CATEGORY_ICONS[category];

        return (
          <section
            key={category}
            className={cn(index > 0 && "border-border/60 border-t pt-8 sm:pt-10")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-2xl sm:size-10",
                    sectionChipClassName(category),
                  )}
                >
                  <SectionIcon className="size-4.5 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl">
                    {PRODUCT_CATEGORY_LABELS[category]}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {sectionDescriptions[category]}
                  </p>
                  {category === "gamepasses" && (
                    <p className="text-muted-foreground mt-1 text-xs font-medium">
                      Official Roblox gamepasses · No login details required
                    </p>
                  )}
                </div>
              </div>
              <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                {items.length} option{items.length === 1 ? "" : "s"}
              </p>
            </div>

            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className={cn(
                "mt-4 grid grid-cols-1 gap-3 sm:gap-5",
                category === "currency"
                  ? "sm:grid-cols-2 lg:grid-cols-3"
                  : "sm:grid-cols-2 xl:grid-cols-3",
              )}
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
                      gameIconUrl={gameIconUrl}
                      category={category}
                      badge={badge}
                      featured={isBestValue}
                      orderingDisabled={orderingDisabled}
                      robloxIconUrl={robloxIconUrls?.get(gamepass.id)}
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
