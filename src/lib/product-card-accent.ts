export interface ProductCardAccentSettings {
  enabled: boolean;
  blurPx: number;
  offsetXPercent: number;
  offsetYPx: number;
  scalePercent: number;
  opacityPercent: number;
}

export type ProductCardAccentSettingsWithMeta = ProductCardAccentSettings & {
  hasCustomSettings: boolean;
};

export const DEFAULT_PRODUCT_CARD_ACCENT_SETTINGS: ProductCardAccentSettings = {
  enabled: true,
  blurPx: 6,
  offsetXPercent: 55,
  offsetYPx: 0,
  scalePercent: 220,
  opacityPercent: 24,
};

export const PRODUCT_CARD_ACCENT_LIMITS = {
  blurPx: { min: 0, max: 20, step: 0.5 },
  offsetXPercent: { min: 0, max: 90, step: 1 },
  offsetYPx: { min: -60, max: 60, step: 1 },
  scalePercent: { min: 120, max: 250, step: 1 },
  opacityPercent: { min: 5, max: 35, step: 1 },
} as const;

export function clampProductCardAccentSettings(
  settings: ProductCardAccentSettings,
): ProductCardAccentSettings {
  return {
    enabled: settings.enabled,
    blurPx: clamp(
      settings.blurPx,
      PRODUCT_CARD_ACCENT_LIMITS.blurPx.min,
      PRODUCT_CARD_ACCENT_LIMITS.blurPx.max,
    ),
    offsetXPercent: Math.round(
      clamp(
        settings.offsetXPercent,
        PRODUCT_CARD_ACCENT_LIMITS.offsetXPercent.min,
        PRODUCT_CARD_ACCENT_LIMITS.offsetXPercent.max,
      ),
    ),
    offsetYPx: Math.round(
      clamp(
        settings.offsetYPx,
        PRODUCT_CARD_ACCENT_LIMITS.offsetYPx.min,
        PRODUCT_CARD_ACCENT_LIMITS.offsetYPx.max,
      ),
    ),
    scalePercent: Math.round(
      clamp(
        settings.scalePercent,
        PRODUCT_CARD_ACCENT_LIMITS.scalePercent.min,
        PRODUCT_CARD_ACCENT_LIMITS.scalePercent.max,
      ),
    ),
    opacityPercent: Math.round(
      clamp(
        settings.opacityPercent,
        PRODUCT_CARD_ACCENT_LIMITS.opacityPercent.min,
        PRODUCT_CARD_ACCENT_LIMITS.opacityPercent.max,
      ),
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
