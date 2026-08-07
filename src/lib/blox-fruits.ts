import {
  BLOX_FRUITS_SECTION_ORDER,
  classifyBloxFruitsProduct,
  type BloxFruitsSection,
} from "@/config/blox-fruits";
import type { StoreGamepass } from "@/types/database";

export function groupBloxFruitsProducts(
  gamepasses: StoreGamepass[],
): { section: BloxFruitsSection; items: StoreGamepass[] }[] {
  const buckets = new Map<BloxFruitsSection, StoreGamepass[]>();
  for (const gamepass of gamepasses) {
    const section = classifyBloxFruitsProduct(gamepass.name);
    const bucket = buckets.get(section);
    if (bucket) {
      bucket.push(gamepass);
    } else {
      buckets.set(section, [gamepass]);
    }
  }

  return BLOX_FRUITS_SECTION_ORDER.filter((section) => buckets.has(section)).map(
    (section) => ({ section, items: buckets.get(section)! }),
  );
}
