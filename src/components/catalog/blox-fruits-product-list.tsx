"use client";

import { motion, type Variants } from "framer-motion";
import { Gamepad2, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import type { ProductBadgeValue } from "@/components/catalog/product-badge";
import {
  BLOX_FRUITS_SECTION_LABELS,
  type BloxFruitsSection,
} from "@/config/blox-fruits";
import { groupBloxFruitsProducts } from "@/lib/blox-fruits";
import { getConfiguredBadge, getBestValueId } from "@/lib/merchandising";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

const SECTION_ICONS: Record<BloxFruitsSection, LucideIcon> = {
  gamepasses: Gamepad2,
  exp: Zap,
  fruits: Sparkles,
};

const SECTION_DESCRIPTIONS: Record<BloxFruitsSection, string> = {
  gamepasses: "Permanent upgrades and special access.",
  exp: "Temporary EXP multipliers — pick how long you need it.",
  fruits: "Devil Fruits, permanently unlocked on your account.",
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function BloxFruitsProductList({
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
  const sections = groupBloxFruitsProducts(gamepasses);

  return (
    <div className="mt-7 flex flex-col gap-8 sm:mt-12 sm:gap-14">
      {sections.map(({ section, items }, index) => {
        const SectionIcon = SECTION_ICONS[section];
        // Best value is computed per section, not across the whole game —
        // comparing an EXP boost's Robux-per-peso against a Permanent
        // Fruit's would be meaningless, and would near-always crown the
        // cheapest EXP boost regardless of what section it's shown in.
        const bestValueId = getBestValueId(
          items.filter(
            (i) =>
              i.availability_status !== "out_of_stock" &&
              i.availability_status !== "coming_soon",
          ),
        );

        return (
          <section
            key={section}
            className={cn(index > 0 && "border-border/60 border-t pt-8 sm:pt-10")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-2xl sm:size-10">
                  <SectionIcon className="text-primary size-4.5 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl">
                    {BLOX_FRUITS_SECTION_LABELS[section]}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {SECTION_DESCRIPTIONS[section]}
                  </p>
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
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3"
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
                      category="gamepasses"
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
