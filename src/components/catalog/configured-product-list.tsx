"use client";

import { motion, type Variants } from "framer-motion";
import { Gamepad2 } from "lucide-react";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import type { ProductBadgeValue } from "@/components/catalog/product-badge";
import type { ConfiguredProductSection } from "@/lib/queries/product-layout";
import { getBestValueId, getConfiguredBadge } from "@/lib/merchandising";
import { getProductCategory } from "@/lib/product-category";
import { cn } from "@/lib/utils";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function ConfiguredProductList({
  sections,
  gameId,
  gameSlug,
  gameName,
  gameIconUrl = null,
  orderingDisabled = false,
  robloxIconUrls,
}: {
  sections: ConfiguredProductSection[];
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl?: string | null;
  orderingDisabled?: boolean;
  robloxIconUrls?: Map<string, string>;
}) {
  return (
    <div className="mt-7 flex flex-col gap-8 sm:mt-12 sm:gap-14">
      {sections.map((section, index) => {
        const bestValueId = getBestValueId(
          section.items.filter(
            (i) =>
              i.availability_status !== "out_of_stock" &&
              i.availability_status !== "coming_soon",
          ),
        );

        return (
          <section
            key={section.id ?? "uncategorized"}
            className={cn(index > 0 && "border-border/60 border-t pt-8 sm:pt-10")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-2xl sm:size-10">
                  <Gamepad2 className="text-primary size-4.5 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl">
                    {section.name}
                  </h2>
                </div>
              </div>
              <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
                {section.items.length} option
                {section.items.length === 1 ? "" : "s"}
              </p>
            </div>

            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3"
            >
              {section.items.map((gamepass) => {
                const category = getProductCategory(gamepass.name);
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
          </section>
        );
      })}
    </div>
  );
}
