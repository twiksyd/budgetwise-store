// Shared enum types for the Store Operations feature — imported by both
// the anon-safe view types (src/types/database.ts) and the service-role
// table types (src/types/database-admin.ts) so the two never drift apart.

export type StoreStatus = "open" | "maintenance" | "closed";

export type GameAvailabilityStatus =
  | "available"
  | "temporarily_unavailable"
  | "coming_soon"
  | "hidden";

export type ProductAvailabilityStatus =
  | "available"
  | "out_of_stock"
  | "coming_soon"
  | "hidden";

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  open: "Open",
  maintenance: "Maintenance",
  closed: "Closed",
};

export const GAME_AVAILABILITY_LABELS: Record<GameAvailabilityStatus, string> = {
  available: "Available",
  temporarily_unavailable: "Temporarily Unavailable",
  coming_soon: "Coming Soon",
  hidden: "Hidden",
};

export const PRODUCT_AVAILABILITY_LABELS: Record<
  ProductAvailabilityStatus,
  string
> = {
  available: "Available",
  out_of_stock: "Out of Stock",
  coming_soon: "Coming Soon",
  hidden: "Hidden",
};

// Shown to customers (banner + checkout rejection) whenever the store isn't
// "open" and no custom notice_message has been written for the occasion.
export const STORE_STATUS_DEFAULT_MESSAGES: Record<
  Exclude<StoreStatus, "open">,
  string
> = {
  maintenance:
    "Ordering is temporarily unavailable while we perform maintenance.",
  closed:
    "BudgetWise is temporarily closed and isn't accepting new orders right now.",
};
