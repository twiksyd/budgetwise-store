import {
  getProductCardAccentMaskStyles,
  type ProductCardAccentSettings,
} from "@/lib/product-card-accent";

const PRODUCT_CARD_ACCENT_BASE_SIZE_PX = 76;

export function ProductCardArtworkAccent({
  src,
  settings,
}: {
  src?: string | null;
  settings: ProductCardAccentSettings;
}) {
  if (!src || !settings.enabled) return null;

  const sizePx = Math.round(
    PRODUCT_CARD_ACCENT_BASE_SIZE_PX * (settings.scalePercent / 100),
  );
  const maskStyles = getProductCardAccentMaskStyles(settings);

  return (
    <div
      data-product-card-artwork-accent=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={maskStyles.outerMask}
    >
      <div
        className="absolute top-1/2 right-0"
        style={{
          height: `${sizePx}px`,
          width: `${sizePx}px`,
          opacity: settings.opacityPercent / 100,
          filter: `blur(${settings.blurPx}px) saturate(1.25)`,
          transform: `translate(${settings.offsetXPercent}%, calc(-50% + ${settings.offsetYPx}px))`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full rounded-[2rem] object-cover dark:mix-blend-screen dark:brightness-125 dark:saturate-150"
          style={maskStyles.iconMask}
        />
      </div>
    </div>
  );
}
