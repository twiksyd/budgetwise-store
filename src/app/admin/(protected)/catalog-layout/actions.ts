"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  PRODUCT_CARD_ACCENT_LIMITS,
  type ProductCardAccentSettings,
} from "@/lib/product-card-accent";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CatalogLayoutActionResult {
  success: boolean;
  error?: string;
}

export interface ProductLayoutSectionInput {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ProductLayoutProductInput {
  gamepassId: string;
  sectionId: string | null;
  sortOrder: number;
}

const MAX_PRODUCT_SECTIONS = 100;
const MAX_PRODUCTS_PER_LAYOUT = 1000;
const MAX_PRODUCT_DISPLAY_NAME_LENGTH = 80;

async function validateGameIds(gameIds: string[]) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    return "At least one game is required.";
  }

  if (gameIds.length > 500) {
    return "Too many games supplied.";
  }

  if (new Set(gameIds).size !== gameIds.length) {
    return "Duplicate games are not allowed.";
  }

  const invalidId = gameIds.find(
    (id) => typeof id !== "string" || !UUID_RE.test(id),
  );
  if (invalidId) {
    return `Invalid game ID: ${String(invalidId)}`;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("games")
    .select("id")
    .in("id", gameIds);

  if (error) return error.message;

  const existingIds = new Set((data ?? []).map((game) => game.id));
  const missingId = gameIds.find((id) => !existingIds.has(id));
  if (missingId) {
    return `Game is no longer in the catalog: ${missingId}`;
  }

  return null;
}

function revalidateCatalogLayout() {
  revalidatePath("/", "layout");
  revalidatePath("/games", "layout");
  revalidatePath("/admin/catalog-layout");
}

async function validateGameId(gameId: string) {
  if (typeof gameId !== "string" || !UUID_RE.test(gameId)) {
    return "Invalid game ID.";
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("games")
    .select("id")
    .eq("id", gameId)
    .maybeSingle();

  if (error) return error.message;
  if (!data) return "Game is no longer in the catalog.";
  return null;
}

async function validateGamepassId(gamepassId: string) {
  if (typeof gamepassId !== "string" || !UUID_RE.test(gamepassId)) {
    return "Invalid product ID.";
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gamepasses")
    .select("id")
    .eq("id", gamepassId)
    .maybeSingle();

  if (error) return error.message;
  if (!data) return "Product is no longer in the catalog.";
  return null;
}

function validateAccentSettings(input: ProductCardAccentSettings) {
  if (typeof input.enabled !== "boolean") {
    return "Accent enabled must be true or false.";
  }

  const checks = [
    {
      label: "Blur",
      value: input.blurPx,
      ...PRODUCT_CARD_ACCENT_LIMITS.blurPx,
    },
    {
      label: "Horizontal position",
      value: input.offsetXPercent,
      ...PRODUCT_CARD_ACCENT_LIMITS.offsetXPercent,
    },
    {
      label: "Vertical position",
      value: input.offsetYPx,
      ...PRODUCT_CARD_ACCENT_LIMITS.offsetYPx,
    },
    {
      label: "Size",
      value: input.scalePercent,
      ...PRODUCT_CARD_ACCENT_LIMITS.scalePercent,
    },
    {
      label: "Opacity",
      value: input.opacityPercent,
      ...PRODUCT_CARD_ACCENT_LIMITS.opacityPercent,
    },
    {
      label: "Fade Start",
      value: input.fadeStartPercent,
      ...PRODUCT_CARD_ACCENT_LIMITS.fadeStartPercent,
    },
    {
      label: "Fade Softness",
      value: input.fadeWidthPercent,
      ...PRODUCT_CARD_ACCENT_LIMITS.fadeWidthPercent,
    },
  ];

  for (const check of checks) {
    if (
      !Number.isFinite(check.value) ||
      check.value < check.min ||
      check.value > check.max
    ) {
      return `${check.label} must be between ${check.min} and ${check.max}.`;
    }
  }

  return null;
}

async function validateProductLayoutInput(input: {
  gameId: string;
  sections: ProductLayoutSectionInput[];
  products: ProductLayoutProductInput[];
}) {
  const gameError = await validateGameId(input.gameId);
  if (gameError) return gameError;

  if (!Array.isArray(input.sections) || !Array.isArray(input.products)) {
    return "Invalid product layout payload.";
  }

  if (input.sections.length > MAX_PRODUCT_SECTIONS) {
    return "Too many categories supplied.";
  }

  if (input.products.length > MAX_PRODUCTS_PER_LAYOUT) {
    return "Too many products supplied.";
  }

  const sectionIds = new Set<string>();
  for (const section of input.sections) {
    if (!UUID_RE.test(section.id)) return "Invalid category ID.";
    const name = section.name.trim();
    if (!name) return "Category names cannot be empty.";
    if (name.length > 48) return "Category names must be 48 characters or less.";
    if (!Number.isInteger(section.sortOrder) || section.sortOrder < 0) {
      return "Category order is invalid.";
    }
    if (sectionIds.has(section.id)) return "Duplicate categories are not allowed.";
    sectionIds.add(section.id);
  }

  const productIds = new Set<string>();
  for (const product of input.products) {
    if (!UUID_RE.test(product.gamepassId)) return "Invalid product ID.";
    if (
      product.sectionId !== null &&
      (!UUID_RE.test(product.sectionId) || !sectionIds.has(product.sectionId))
    ) {
      return "Product category is invalid.";
    }
    if (!Number.isInteger(product.sortOrder) || product.sortOrder < 0) {
      return "Product order is invalid.";
    }
    if (productIds.has(product.gamepassId)) {
      return "Duplicate products are not allowed.";
    }
    productIds.add(product.gamepassId);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gamepasses")
    .select("id")
    .eq("game_id", input.gameId)
    .in("id", [...productIds]);

  if (error) return error.message;

  const existingProductIds = new Set((data ?? []).map((product) => product.id));
  const missingProductId = [...productIds].find((id) => !existingProductIds.has(id));
  if (missingProductId) {
    return `Product is no longer in this game: ${missingProductId}`;
  }

  return null;
}

export async function saveGameOrderAction(
  gameIds: string[],
): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError = await validateGameIds(gameIds);
  if (validationError) return { success: false, error: validationError };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_store_game_order", {
    p_game_ids: gameIds,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function saveFeaturedGamesAction(input: {
  featuredGameIds: string[];
  featuredGameLimit: number;
}): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError =
    input.featuredGameIds.length > 0
      ? await validateGameIds(input.featuredGameIds)
      : null;
  if (validationError) return { success: false, error: validationError };

  if (
    !Number.isInteger(input.featuredGameLimit) ||
    input.featuredGameLimit < 1 ||
    input.featuredGameLimit > 12
  ) {
    return {
      success: false,
      error: "Featured game count must be between 1 and 12.",
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_featured_games", {
    p_featured_game_ids: input.featuredGameIds,
    p_featured_game_limit: input.featuredGameLimit,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function resetGameOrderAction(): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("reset_store_game_order", {
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function saveProductLayoutAction(input: {
  gameId: string;
  sections: ProductLayoutSectionInput[];
  products: ProductLayoutProductInput[];
}): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError = await validateProductLayoutInput(input);
  if (validationError) return { success: false, error: validationError };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_store_product_layout", {
    p_game_id: input.gameId,
    p_sections: input.sections.map((section, index) => ({
      id: section.id,
      name: section.name.trim(),
      sort_order: index,
    })),
    p_products: input.products.map((product) => ({
      gamepass_id: product.gamepassId,
      section_id: product.sectionId,
      sort_order: product.sortOrder,
    })),
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function resetProductLayoutAction(
  gameId: string,
): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError = await validateGameId(gameId);
  if (validationError) return { success: false, error: validationError };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("reset_store_product_layout", {
    p_game_id: gameId,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function saveProductDisplayNameAction(input: {
  gamepassId: string;
  displayName: string | null;
}): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError = await validateGamepassId(input.gamepassId);
  if (validationError) return { success: false, error: validationError };

  const displayName = input.displayName?.trim() || null;
  if (displayName && displayName.length > MAX_PRODUCT_DISPLAY_NAME_LENGTH) {
    return {
      success: false,
      error: `Display name must be ${MAX_PRODUCT_DISPLAY_NAME_LENGTH} characters or less.`,
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_store_product_display_name", {
    p_gamepass_id: input.gamepassId,
    p_display_name: displayName,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function saveProductCardAccentSettingsAction(input: {
  gameId: string;
  settings: ProductCardAccentSettings;
}): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const gameError = await validateGameId(input.gameId);
  if (gameError) return { success: false, error: gameError };

  const settingsError = validateAccentSettings(input.settings);
  if (settingsError) return { success: false, error: settingsError };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("apply_store_game_card_accent_settings", {
    p_game_id: input.gameId,
    p_enabled: input.settings.enabled,
    p_blur_px: input.settings.blurPx,
    p_offset_x_percent: Math.round(input.settings.offsetXPercent),
    p_offset_y_px: Math.round(input.settings.offsetYPx),
    p_scale_percent: Math.round(input.settings.scalePercent),
    p_opacity_percent: Math.round(input.settings.opacityPercent),
    p_fade_start_percent: Math.round(input.settings.fadeStartPercent),
    p_fade_width_percent: Math.round(input.settings.fadeWidthPercent),
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}

export async function resetProductCardAccentSettingsAction(
  gameId: string,
): Promise<CatalogLayoutActionResult> {
  const admin = await requireAdmin();
  const validationError = await validateGameId(gameId);
  if (validationError) return { success: false, error: validationError };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("reset_store_game_card_accent_settings", {
    p_game_id: gameId,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateCatalogLayout();
  return { success: true };
}
