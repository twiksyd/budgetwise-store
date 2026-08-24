export interface ProductCardAccentSettings {
  enabled: boolean;
  blurPx: number;
  offsetXPercent: number;
  offsetYPx: number;
  scalePercent: number;
  opacityPercent: number;
  fadeStartPercent: number;
  fadeWidthPercent: number;
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
  fadeStartPercent: 32,
  fadeWidthPercent: 46,
};

export const PRODUCT_CARD_ACCENT_LIMITS = {
  blurPx: { min: 0, max: 20, step: 0.5 },
  offsetXPercent: { min: 0, max: 90, step: 1 },
  offsetYPx: { min: -60, max: 60, step: 1 },
  scalePercent: { min: 120, max: 250, step: 1 },
  opacityPercent: { min: 5, max: 35, step: 1 },
  fadeStartPercent: { min: 30, max: 80, step: 1 },
  fadeWidthPercent: { min: 16, max: 56, step: 1 },
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
    fadeStartPercent: Math.round(
      clamp(
        settings.fadeStartPercent,
        PRODUCT_CARD_ACCENT_LIMITS.fadeStartPercent.min,
        PRODUCT_CARD_ACCENT_LIMITS.fadeStartPercent.max,
      ),
    ),
    fadeWidthPercent: Math.round(
      clamp(
        settings.fadeWidthPercent,
        PRODUCT_CARD_ACCENT_LIMITS.fadeWidthPercent.min,
        PRODUCT_CARD_ACCENT_LIMITS.fadeWidthPercent.max,
      ),
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function getProductCardAccentMaskStyles(
  settings: ProductCardAccentSettings,
) {
  const fadeStart = clamp(
    settings.fadeStartPercent,
    PRODUCT_CARD_ACCENT_LIMITS.fadeStartPercent.min,
    PRODUCT_CARD_ACCENT_LIMITS.fadeStartPercent.max,
  );
  const fadeWidth = clamp(
    settings.fadeWidthPercent,
    PRODUCT_CARD_ACCENT_LIMITS.fadeWidthPercent.min,
    PRODUCT_CARD_ACCENT_LIMITS.fadeWidthPercent.max,
  );
  const softStop = clamp(fadeStart + fadeWidth, fadeStart + 12, 100);
  const p1 = clamp(fadeStart + fadeWidth * 0.2, fadeStart, 100);
  const p2 = clamp(fadeStart + fadeWidth * 0.45, p1, 100);
  const p3 = clamp(fadeStart + fadeWidth * 0.7, p2, 100);
  const p4 = softStop;
  const p5 = clamp(p4 + (100 - p4) * 0.55, p4, 100);
  const outerMaskImage = `linear-gradient(90deg, transparent 0%, transparent ${fadeStart}%, rgba(0,0,0,0.08) ${p1}%, rgba(0,0,0,0.22) ${p2}%, rgba(0,0,0,0.48) ${p3}%, rgba(0,0,0,0.72) ${p4}%, rgba(0,0,0,0.88) ${p5}%, black 100%)`;
  const iconMaskImage =
    "radial-gradient(ellipse at 58% 50%, black 0%, black 48%, rgba(0,0,0,0.72) 72%, transparent 100%)";

  return {
    outerMask: {
      maskImage: outerMaskImage,
      WebkitMaskImage: outerMaskImage,
    },
    iconMask: {
      maskImage: iconMaskImage,
      WebkitMaskImage: iconMaskImage,
    },
  };
}
