import { renderBrandIcon } from "@/lib/brand-icon";

export const contentType = "image/png";

const sizes: Record<string, number> = {
  small: 16,
  medium: 32,
  large: 48,
};

export function generateImageMetadata() {
  return Object.entries(sizes).map(([id, px]) => ({
    id,
    size: { width: px, height: px },
    contentType,
  }));
}

export default function Icon({ id }: { id: string }) {
  return renderBrandIcon(sizes[id]);
}
