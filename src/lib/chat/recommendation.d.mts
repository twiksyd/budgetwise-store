export type RecommendationType = "game" | "product";
export declare const RECOMMENDATION_TYPES: readonly ["game", "product"];
export function isRecommendationType(value: unknown): value is RecommendationType;

export interface RecommendationPayload {
  type: RecommendationType;
  game_id: string;
  game_slug: string;
  game_name: string;
  gamepass_id?: string;
  product_name?: string;
  price?: number;
  robux_amount?: number;
}

export function buildRecommendationPayload(input: {
  type: RecommendationType;
  game: { id: string; slug: string | null; name: string } | null;
  product?: { id: string; game_id: string; name: string; price: number | string; robux_amount?: number | null } | null;
}): RecommendationPayload | null;

/** Customer-safe product card. */
export interface ProductCardDto {
  type: RecommendationType;
  gameName: string;
  gameSlug: string;
  gameImageUrl: string | null;
  gamepassId: string | null;
  productName: string | null;
  productImageUrl: string | null;
  /** Current catalog price (product cards), or the sent price when no longer listed. */
  price: number | null;
  /** The price when the card was sent. */
  sentPrice: number | null;
  priceChanged: boolean;
  robuxAmount: number | null;
  /** removed = no longer in the catalog; unavailable = listed but not orderable right now. */
  status: "available" | "unavailable" | "removed";
  /** The order this card led to (only from a verified link). */
  orderedAs: string | null;
}

export function toProductCard(
  payload: unknown,
  live?: {
    game?: { name: string; slug: string | null; availability_status?: string | null } | null;
    product?: { name: string; display_name?: string | null; price: number | string; robux_amount?: number | null; availability_status?: string | null } | null;
    gameImageUrl?: string | null;
    productImageUrl?: string | null;
  },
  orderedAs?: string | null,
): ProductCardDto | null;

export function recommendationHref(
  card: Pick<ProductCardDto, "type" | "gameSlug" | "gamepassId"> | null | undefined,
  messageId: string | null | undefined,
): string | null;

export function parseRecommendationId(value: unknown): string | null;
