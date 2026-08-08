"use client";

import { motion, type Variants } from "framer-motion";
import { Egg } from "lucide-react";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import type { ProductBadgeValue } from "@/components/catalog/product-badge";
import { isFallEggProduct } from "@/config/grow-a-garden-2";
import { getBestValueId, getConfiguredBadge } from "@/lib/merchandising";
import {
  groupByCategory,
  PRODUCT_CATEGORY_ICONS,
  PRODUCT_CATEGORY_LABELS,
  type ProductCategory,
} from "@/lib/product-category";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

function ProductGrid({
  items,
  gameId,
  gameSlug,
  gameName,
  gameIconUrl,
  category,
  orderingDisabled,
  robloxIconUrls,
}: {
  items: StoreGamepass[];
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl: string | null;
  category: ProductCategory;
  orderingDisabled: boolean;
  robloxIconUrls?: Map<string, string>;
}) {
  const bestValueId = getBestValueId(
    items.filter(
      (i) =>
        i.availability_status !== "out_of_stock" &&
        i.availability_status !== "coming_soon",
    ),
  );

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={cn(
        "mt-4 grid grid-cols-1 gap-3 sm:gap-5",
        category === "currency" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {items.map((gamepass) => {
        const isBestValue = gamepass.id === bestValueId;
        const badge: ProductBadgeValue | null = isBestValue
          ? "best-value"
          : getConfiguredBadge(gamepass.id);

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
  );
}

export function GrowAGarden2ProductList({
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
  const fallEggItems = gamepasses.filter((g) => isFallEggProduct(g.name));
  const rest = gamepasses.filter((g) => !isFallEggProduct(g.name));
  const restSections = groupByCategory(rest);

  return (
    <div className="mt-7 flex flex-col gap-8 sm:mt-12 sm:gap-14">
      {restSections.map(({ category, items }, index) => {
        const SectionIcon = PRODUCT_CATEGORY_ICONS[category];
        return (
          <section
            key={category}
            className={cn(index > 0 && "border-border/60 border-t pt-8 sm:pt-10")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-2xl sm:size-10">
                  <SectionIcon className="text-primary size-4.5 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl">
                    {PRODUCT_CATEGORY_LABELS[category]}
                  </h2>
                </div>
              </div>
              <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                {items.length} option{items.length === 1 ? "" : "s"}
              </p>
            </div>

            <ProductGrid
              items={items}
              gameId={gameId}
              gameSlug={gameSlug}
              gameName={gameName}
              gameIconUrl={gameIconUrl}
              category={category}
              orderingDisabled={orderingDisabled}
              robloxIconUrls={robloxIconUrls}
            />
          </section>
        );
      })}

      {fallEggItems.length > 0 && (
        <section
          className={cn(restSections.length > 0 && "border-border/60 border-t pt-8 sm:pt-10")}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-2xl sm:size-10">
                <Egg className="text-primary size-4.5 sm:size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl">
                  Fall Egg
                </h2>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  Roll bundles for the Fall Egg — pick a bundle size.
                </p>
              </div>
            </div>
            <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
              {fallEggItems.length} option{fallEggItems.length === 1 ? "" : "s"}
            </p>
          </div>

          <ProductGrid
            items={fallEggItems}
            gameId={gameId}
            gameSlug={gameSlug}
            gameName={gameName}
            gameIconUrl={gameIconUrl}
            category="gamepasses"
            orderingDisabled={orderingDisabled}
            robloxIconUrls={robloxIconUrls}
          />
        </section>
      )}
    </div>
  );
}
