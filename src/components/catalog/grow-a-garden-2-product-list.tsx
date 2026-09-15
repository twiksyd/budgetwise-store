"use client";

import { useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Egg } from "lucide-react";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import type { ProductBadgeValue } from "@/components/catalog/product-badge";
import {
  BackToCategoriesButton,
  ProductDiscoveryBar,
  ProductSearchEmptyState,
  useScrolledPast,
  useSectionScrollSpy,
} from "@/components/catalog/product-discovery-bar";
import { isFallEggProduct } from "@/config/grow-a-garden-2";
import type { ProductCardAccentSettings } from "@/lib/product-card-accent";
import type { ProductArtworkSource } from "@/lib/product-artwork-source";
import { getBestValueId, getConfiguredBadge } from "@/lib/merchandising";
import {
  groupByCategory,
  PRODUCT_CATEGORY_ICONS,
  PRODUCT_CATEGORY_LABELS,
  type ProductCategory,
} from "@/lib/product-category";
import {
  filterSectionsBySearch,
  normalizeSearchText,
  sectionAnchorId,
} from "@/lib/product-search";
import { cn } from "@/lib/utils";
import type { StoreGamepass } from "@/types/database";

const FALL_EGG_KEY = "fall-egg";

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
  productArtworkSources,
  cardBackgroundUrls,
  accentSettings,
}: {
  items: StoreGamepass[];
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl: string | null;
  category: ProductCategory;
  orderingDisabled: boolean;
  robloxIconUrls?: Map<string, string>;
  productArtworkSources?: Map<string, ProductArtworkSource>;
  cardBackgroundUrls?: Map<string, string>;
  accentSettings?: ProductCardAccentSettings;
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
              hasProductSpecificArtwork={
                productArtworkSources?.get(gamepass.id) === "manual" ||
                productArtworkSources?.get(gamepass.id) === "roblox"
              }
              cardBackgroundUrl={cardBackgroundUrls?.get(gamepass.id)}
              accentSettings={accentSettings}
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
  productArtworkSources,
  cardBackgroundUrls,
  accentSettings,
}: {
  gamepasses: StoreGamepass[];
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl?: string | null;
  orderingDisabled?: boolean;
  robloxIconUrls?: Map<string, string>;
  productArtworkSources?: Map<string, ProductArtworkSource>;
  cardBackgroundUrls?: Map<string, string>;
  accentSettings?: ProductCardAccentSettings;
}) {
  const fallEggItems = gamepasses.filter((g) => isFallEggProduct(g.name));
  const rest = gamepasses.filter((g) => !isFallEggProduct(g.name));
  const restSections = groupByCategory(rest);
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearchText(query);

  const sections = useMemo(
    () => [
      ...restSections.map((s) => ({
        key: s.category as string,
        label: PRODUCT_CATEGORY_LABELS[s.category],
        items: s.items,
      })),
      ...(fallEggItems.length > 0
        ? [{ key: FALL_EGG_KEY, label: "Fall Egg", items: fallEggItems }]
        : []),
    ],
    [restSections, fallEggItems],
  );

  const filteredSections = useMemo(
    () => filterSectionsBySearch(sections, normalizedQuery),
    [sections, normalizedQuery],
  );
  const visibleRestSections = filteredSections.filter((s) => s.key !== FALL_EGG_KEY);
  const visibleFallEgg = filteredSections.find((s) => s.key === FALL_EGG_KEY);

  const sectionIds = useMemo(
    () => sections.map((s) => sectionAnchorId(gameSlug, s.key)),
    [sections, gameSlug],
  );
  const activeId = useSectionScrollSpy(sectionIds);

  const categories = useMemo(
    () =>
      (normalizedQuery ? filteredSections : sections).map((s) => ({
        id: sectionAnchorId(gameSlug, s.key),
        label: s.label,
        count: s.items.length,
      })),
    [filteredSections, sections, normalizedQuery, gameSlug],
  );

  const showSearch = gamepasses.length > 6;
  const discoveryBarId = `${gameSlug}-product-discovery`;
  const showBackToCategories =
    useScrolledPast(discoveryBarId) && sections.length > 2;

  return (
    <div className="mt-7">
      {(showSearch || sections.length > 1) && (
        <div id={discoveryBarId} className="mb-8 sm:mb-12">
          <ProductDiscoveryBar
            query={query}
            onQueryChange={setQuery}
            showSearch={showSearch}
            categories={categories}
            activeId={activeId}
            searchInputId={`${gameSlug}-product-search`}
          />
        </div>
      )}

      {filteredSections.length === 0 ? (
        <ProductSearchEmptyState onClear={() => setQuery("")} />
      ) : (
      <div className="flex flex-col gap-8 sm:gap-14">
      {visibleRestSections.map(({ key, items }, index) => {
        const category = key as ProductCategory;
        const SectionIcon = PRODUCT_CATEGORY_ICONS[category];
        return (
          <section
            key={category}
            id={sectionAnchorId(gameSlug, category)}
            className={cn(
              "scroll-mt-24",
              index > 0 && "border-border/60 border-t pt-8 sm:pt-10",
            )}
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
              productArtworkSources={productArtworkSources}
              cardBackgroundUrls={cardBackgroundUrls}
              accentSettings={accentSettings}
            />
          </section>
        );
      })}

      {visibleFallEgg && (
        <section
          id={sectionAnchorId(gameSlug, FALL_EGG_KEY)}
          className={cn(
            "scroll-mt-24",
            visibleRestSections.length > 0 && "border-border/60 border-t pt-8 sm:pt-10",
          )}
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
              {visibleFallEgg.items.length} option
              {visibleFallEgg.items.length === 1 ? "" : "s"}
            </p>
          </div>

          <ProductGrid
            items={visibleFallEgg.items}
            gameId={gameId}
            gameSlug={gameSlug}
            gameName={gameName}
            gameIconUrl={gameIconUrl}
            category="gamepasses"
            orderingDisabled={orderingDisabled}
            robloxIconUrls={robloxIconUrls}
            productArtworkSources={productArtworkSources}
            cardBackgroundUrls={cardBackgroundUrls}
            accentSettings={accentSettings}
          />
        </section>
      )}
      </div>
      )}

      <BackToCategoriesButton targetId={discoveryBarId} show={showBackToCategories} />
    </div>
  );
}
