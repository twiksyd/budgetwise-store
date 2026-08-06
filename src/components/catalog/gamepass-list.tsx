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

// Each category gets its own accent so a scroll through five sections reads
// as distinct "aisles" rather than one undifferentiated list — the eye can
// orient on color before it even reads the label. Currency and Gamepasses
// (the two largest, most routine buckets) stay on the neutral primary tint;
// VIP and Limited lean into their existing semantic colors (premium violet,
// urgent amber) so the section header reinforces what the badges already say.
// Violet was ruled out for VIP — the site's own --primary is already a
// blue-violet, so a violet "premium" accent read as barely different from
// the default currency/gamepasses chip instead of standing apart. Teal
// sits clearly outside both the primary purple and the rose/amber used
// elsewhere here.
const CATEGORY_CHIP_CLASSNAME: Record<ProductCategory, string> = {
  currency: "bg-primary/10 text-primary",
  gamepasses: "bg-primary/10 text-primary",
  vip: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  bundle: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  limited: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

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
  gameIconUrl = null,
  orderingDisabled = false,
}: {
  gamepasses: StoreGamepass[];
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl?: string | null;
  orderingDisabled?: boolean;
}) {
  // Best Value is only meaningful among items you can actually buy right
  // now — crowning an out-of-stock or coming-soon item would put the gold
  // "you should buy this" treatment on a disabled card. Excluding rather
  // than requiring an exact "available" match keeps this correct even if
  // availability_status is ever missing (e.g. before the Store Operations
  // migration has been applied).
  const bestValueId = getBestValueId(
    gamepasses.filter(
      (g) =>
        g.availability_status !== "out_of_stock" &&
        g.availability_status !== "coming_soon",
    ),
  );
  const sections = groupByCategory(gamepasses);

  return (
    <div className="mt-10 flex flex-col gap-14 sm:gap-16">
      {sections.map(({ category, items }, index) => {
        const SectionIcon = PRODUCT_CATEGORY_ICONS[category];

        return (
          <section
            key={category}
            className={cn(
              index > 0 && "border-border/60 border-t pt-14 sm:pt-16",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  CATEGORY_CHIP_CLASSNAME[category],
                )}
              >
                <SectionIcon className="size-5" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
                  {PRODUCT_CATEGORY_LABELS[category]}
                </h2>
                <p className="text-muted-foreground text-xs">
                  {items.length} option{items.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className={cn(
                "mt-5 grid grid-cols-1 gap-4",
                // Currency tiles carry far less content than a full product
                // card (no name, no Robux line), so they read better in a
                // denser grid — more like picking a top-up amount — once
                // there's room to spare at tablet/desktop widths. Mobile
                // stays single-column with everything else so long amount
                // strings (e.g. "Rp. 10,000,000,000") never get cramped.
                category === "currency"
                  ? "sm:grid-cols-3 lg:grid-cols-4"
                  : "sm:grid-cols-2 lg:grid-cols-3",
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
