import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import type { StoreGamepass } from "@/types/database";

export interface ConfiguredProductSection {
  id: string | null;
  name: string;
  items: StoreGamepass[];
}

export interface ConfiguredProductLayout {
  sections: ConfiguredProductSection[];
}

type ProductSectionRow = {
  id: string;
  game_id: string;
  name: string;
  sort_order: number;
};

type ProductPresentationRow = {
  gamepass_id: string;
  game_id: string;
  section_id: string | null;
  sort_order: number;
};

function isMissingProductLayoutTableError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("store_product_sections") === true ||
    error.message?.includes("store_product_presentation") === true
  );
}

function availabilityBucket(status: StoreGamepass["availability_status"]) {
  return status === "available" ? 0 : 1;
}

export async function getProductLayoutForGame(
  gameId: string,
  gamepasses: StoreGamepass[],
): Promise<ConfiguredProductLayout | null> {
  if (gamepasses.length === 0) return null;

  const supabase = createPublicClient();
  const [sectionsResult, presentationResult] = await Promise.all([
    supabase
      .from("store_product_sections")
      .select("id, game_id, name, sort_order")
      .eq("game_id", gameId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("store_product_presentation")
      .select("gamepass_id, game_id, section_id, sort_order")
      .eq("game_id", gameId),
  ]);

  if (sectionsResult.error) {
    if (isMissingProductLayoutTableError(sectionsResult.error)) return null;
    throw sectionsResult.error;
  }

  if (presentationResult.error) {
    if (isMissingProductLayoutTableError(presentationResult.error)) return null;
    throw presentationResult.error;
  }

  const sections = (sectionsResult.data ?? []) as ProductSectionRow[];
  const presentationRows =
    (presentationResult.data ?? []) as ProductPresentationRow[];
  const presentationByProductId = new Map(
    presentationRows.map((row) => [row.gamepass_id, row]),
  );

  const hasConfiguredLayout =
    sections.length > 0 ||
    gamepasses.some((gamepass) => presentationByProductId.has(gamepass.id));
  if (!hasConfiguredLayout) return null;

  const sectionIds = new Set(sections.map((section) => section.id));
  const fallbackOrderById = new Map(
    gamepasses.map((gamepass, index) => [gamepass.id, index]),
  );
  const productsBySectionId = new Map<string | null, StoreGamepass[]>();

  for (const gamepass of gamepasses) {
    const presentation = presentationByProductId.get(gamepass.id);
    const sectionId =
      presentation?.section_id && sectionIds.has(presentation.section_id)
        ? presentation.section_id
        : null;
    const list = productsBySectionId.get(sectionId) ?? [];
    list.push(gamepass);
    productsBySectionId.set(sectionId, list);
  }

  function sortProducts(items: StoreGamepass[]) {
    return [...items].sort((a, b) => {
      const availabilityDelta =
        availabilityBucket(a.availability_status) -
        availabilityBucket(b.availability_status);
      if (availabilityDelta !== 0) return availabilityDelta;

      const aPresentation = presentationByProductId.get(a.id);
      const bPresentation = presentationByProductId.get(b.id);
      return (
        (aPresentation?.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (bPresentation?.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        (fallbackOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (fallbackOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name)
      );
    });
  }

  const configuredSections: ConfiguredProductSection[] = [];
  for (const section of sections) {
    const items = sortProducts(productsBySectionId.get(section.id) ?? []);
    if (items.length === 0) continue;
    configuredSections.push({
      id: section.id,
      name: section.name,
      items,
    });
  }

  const uncategorizedItems = sortProducts(productsBySectionId.get(null) ?? []);
  if (uncategorizedItems.length > 0) {
    configuredSections.push({
      id: null,
      name: "Uncategorized",
      items: uncategorizedItems,
    });
  }

  return { sections: configuredSections };
}
