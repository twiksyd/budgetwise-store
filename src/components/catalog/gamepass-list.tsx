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

// The design system deliberately runs on a single accent hue — a per-category
// color taxonomy (one hue per category) was tried and reverted: it read as
// decorative rather than functional and worked against that restraint.
// Limited is the one justified exception, reusing the same amber this app
// already uses site-wide for "pay attention, time-sensitive" (maintenance
// banners, etc.) — an urgency cue, not a taxonomy color.
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
  // Pilot-only, per-product official Roblox Game Pass artwork, keyed by our
  // gamepass id — see config/roblox-universe-ids.ts. Empty for every game
  // not in the pilot; GamepassCard falls back to the normal placeholder
  // whenever a given gamepass has no entry here.
  robloxIconUrls?: Map<string, string>;
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
    // Section-to-section spacing is deliberately just the border+padding on
    // each divided section (~56/64px) — an earlier version also put a large
    // gap on this container, which stacked with that padding into ~110px+
    // of dead scroll between categories instead of the intended amount.
    <div className="mt-10 flex flex-col gap-4 sm:gap-5">
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
                  sectionChipClassName(category),
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
