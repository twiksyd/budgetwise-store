import "server-only";

import {
  DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS,
  type ProductCardAccentSettingsWithMeta,
} from "@/lib/product-card-accent";
import { createAdminClient } from "@/lib/supabase/admin";

type ProductCardAccentSettingsRow = {
  game_id: string;
  enabled: boolean;
  blur_px: number;
  offset_x_percent: number;
  offset_y_px: number;
  scale_percent: number;
  opacity_percent: number;
  fade_start_percent?: number | null;
  fade_width_percent?: number | null;
};

function isMissingAccentSettingsTableError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("store_game_card_accent_settings") === true
  );
}

function fromRow(
  row: ProductCardAccentSettingsRow,
): ProductCardAccentSettingsWithMeta {
  return {
    enabled: row.enabled,
    blurPx: row.blur_px,
    offsetXPercent: row.offset_x_percent,
    offsetYPx: row.offset_y_px,
    scalePercent: row.scale_percent,
    opacityPercent: row.opacity_percent,
    fadeStartPercent:
      row.fade_start_percent ??
      DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS.fadeStartPercent,
    fadeWidthPercent:
      row.fade_width_percent ??
      DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS.fadeWidthPercent,
    hasCustomSettings: true,
  };
}

export function getDefaultProductCardAccentSettings(): ProductCardAccentSettingsWithMeta {
  return {
    ...DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS,
    hasCustomSettings: false,
  };
}

function isMissingAccentSettingsColumnError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message?.includes("fade_start_percent") === true ||
    error.message?.includes("fade_width_percent") === true
  );
}

export async function getProductCardAccentSettingsMap(
  gameIds: string[],
): Promise<Map<string, ProductCardAccentSettingsWithMeta>> {
  const ids = [...new Set(gameIds.filter(Boolean))];
  const settings = new Map<string, ProductCardAccentSettingsWithMeta>(
    ids.map((id) => [id, getDefaultProductCardAccentSettings()]),
  );
  if (ids.length === 0) return settings;

  const supabase = createAdminClient();
  let rows: ProductCardAccentSettingsRow[] | null = null;
  const { data, error } = await supabase
    .from("store_game_card_accent_settings")
    .select(
      "game_id, enabled, blur_px, offset_x_percent, offset_y_px, scale_percent, opacity_percent, fade_start_percent, fade_width_percent",
    )
    .in("game_id", ids);

  if (error) {
    if (isMissingAccentSettingsTableError(error)) return settings;
    if (!isMissingAccentSettingsColumnError(error)) throw error;

    const fallbackResult = await supabase
      .from("store_game_card_accent_settings")
      .select(
        "game_id, enabled, blur_px, offset_x_percent, offset_y_px, scale_percent, opacity_percent",
      )
      .in("game_id", ids);

    if (fallbackResult.error) {
      if (isMissingAccentSettingsTableError(fallbackResult.error)) {
        return settings;
      }
      throw fallbackResult.error;
    }

    rows = fallbackResult.data as ProductCardAccentSettingsRow[];
  } else {
    rows = data as ProductCardAccentSettingsRow[];
  }

  for (const row of rows ?? []) {
    settings.set(row.game_id, fromRow(row));
  }

  return settings;
}

export async function getProductCardAccentSettingsForGame(
  gameId: string,
): Promise<ProductCardAccentSettingsWithMeta> {
  const settings = await getProductCardAccentSettingsMap([gameId]);
  return settings.get(gameId) ?? getDefaultProductCardAccentSettings();
}
