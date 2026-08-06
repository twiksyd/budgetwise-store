// Server-only schema surface for the service-role client (src/lib/supabase/admin.ts).
// Deliberately separate from src/types/database.ts (the anon-safe view types) so a
// client component can never accidentally get cost/profit typing from autocomplete.
//
// Row/Insert shapes must be `type` aliases, not `interface` — postgrest-js's
// generic select-string parser fails to resolve interface-declared shapes
// through its conditional types and silently degrades every column to `never`.

import type {
  GameAvailabilityStatus,
  ProductAvailabilityStatus,
  StoreStatus,
} from "@/types/store-operations";

type GamepassRow = {
  id: string;
  user_id: string;
  game_id: string;
  name: string;
  robux_amount: number;
  your_price: number;
  your_cost: number;
  is_active: boolean;
  availability_status: ProductAvailabilityStatus;
};

type GamepassUpdate = {
  availability_status?: ProductAvailabilityStatus;
};

type GameRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  color: string | null;
  icon_url: string | null;
  sort_order: number | null;
  is_discounted: boolean | null;
  availability_status: GameAvailabilityStatus;
};

type GameUpdate = {
  availability_status?: GameAvailabilityStatus;
};

type StoreSettingsRow = {
  id: boolean;
  store_status: StoreStatus;
  notice_message: string | null;
  scheduled_status: StoreStatus | null;
  scheduled_at: string | null;
  scheduled_reopen_at: string | null;
  updated_at: string;
};

export type StoreSettingsUpdate = {
  store_status?: StoreStatus;
  notice_message?: string | null;
  scheduled_status?: StoreStatus | null;
  scheduled_at?: string | null;
  scheduled_reopen_at?: string | null;
  updated_at?: string;
};

type AdminUserRow = {
  user_id: string;
  created_at: string;
};

type RobloxGamepassIconCacheRow = {
  gamepass_id: string;
  roblox_universe_id: number;
  status: "matched" | "no_match" | "ambiguous";
  source: "manual" | "roblox" | null;
  roblox_gamepass_id: number | null;
  icon_url: string | null;
  matched_name: string | null;
  candidate_count: number;
  synced_at: string;
  last_verified_at: string;
  roblox_updated_at: string | null;
  first_flagged_at: string | null;
};

type RobloxGamepassSnapshotRow = {
  roblox_universe_id: number;
  roblox_gamepass_id: number;
  name: string;
  icon_url: string | null;
  roblox_updated_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

type RobloxSyncLogRow = {
  id: string;
  game_id: string;
  roblox_universe_id: number;
  synced_at: string;
  unchanged_count: number;
  new_count: number;
  artwork_updated_count: number;
  renamed_count: number;
  removed_count: number;
  ambiguous_count: number;
  no_match_count: number;
  details: unknown;
};

type ProductArtworkOverrideRow = {
  gamepass_id: string;
  source: "manual" | "placeholder";
  manual_kind: "upload" | "remote" | null;
  icon_url: string | null;
  storage_path: string | null;
  original_url: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type ProductArtworkOverrideInsert = {
  gamepass_id: string;
  source: "manual" | "placeholder";
  manual_kind?: "upload" | "remote" | null;
  icon_url?: string | null;
  storage_path?: string | null;
  original_url?: string | null;
  content_type?: string | null;
  file_size_bytes?: number | null;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
};

type ProductArtworkOverrideUpdate = Partial<
  Omit<ProductArtworkOverrideInsert, "gamepass_id">
>;

type ProductArtworkAuditLogRow = {
  id: string;
  gamepass_id: string;
  action:
    | "manual_upload"
    | "manual_url"
    | "restore_roblox"
    | "restore_placeholder";
  previous_source: string | null;
  next_source: string | null;
  previous_icon_url: string | null;
  next_icon_url: string | null;
  admin_user_id: string | null;
  admin_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type ProductArtworkAuditLogInsert = Omit<
  ProductArtworkAuditLogRow,
  "id" | "created_at"
> & {
  id?: string;
  created_at?: string;
};

type OrderRow = {
  id: string;
  user_id: string;
  order_number: string;
  gamepass_id: string;
  buyer_name: string;
  buyer_roblox_username: string;
  robux_amount: number;
  selling_price: number;
  cost: number;
  profit: number;
  status: string;
  created_at: string;
};

type OrderInsert = {
  user_id: string;
  order_number: string;
  gamepass_id: string;
  buyer_name: string;
  buyer_roblox_username: string;
  robux_amount: number;
  selling_price: number;
  cost: number;
  profit: number;
  status: string;
};

type StoreGameViewRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  color: string | null;
  icon_url: string | null;
  sort_order: number | null;
  is_discounted: boolean | null;
  availability_status: GameAvailabilityStatus;
};

type StoreGamepassViewRow = {
  id: string;
  game_id: string;
  name: string;
  robux_amount: number;
  price: number;
  availability_status: ProductAvailabilityStatus;
};

export type AdminDatabase = {
  public: {
    Tables: {
      gamepasses: {
        Row: GamepassRow;
        Insert: never;
        Update: GamepassUpdate;
        Relationships: [];
      };
      games: {
        Row: GameRow;
        Insert: never;
        Update: GameUpdate;
        Relationships: [];
      };
      store_settings: {
        Row: StoreSettingsRow;
        Insert: never;
        Update: StoreSettingsUpdate;
        Relationships: [];
      };
      admin_users: {
        Row: AdminUserRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: OrderInsert;
        Update: never;
        Relationships: [];
      };
      roblox_gamepass_icon_cache: {
        Row: RobloxGamepassIconCacheRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      roblox_gamepass_snapshot: {
        Row: RobloxGamepassSnapshotRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      roblox_sync_log: {
        Row: RobloxSyncLogRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      product_artwork_overrides: {
        Row: ProductArtworkOverrideRow;
        Insert: ProductArtworkOverrideInsert;
        Update: ProductArtworkOverrideUpdate;
        Relationships: [];
      };
      product_artwork_audit_log: {
        Row: ProductArtworkAuditLogRow;
        Insert: ProductArtworkAuditLogInsert;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      store_games: {
        Row: StoreGameViewRow;
        Relationships: [];
      };
      store_gamepasses: {
        Row: StoreGamepassViewRow;
        Relationships: [];
      };
    };
    Functions: {
      apply_product_artwork_override: {
        Args: {
          p_gamepass_id: string;
          p_action:
            | "manual_upload"
            | "manual_url"
            | "restore_roblox"
            | "restore_placeholder";
          p_source?: "manual" | "placeholder" | null;
          p_manual_kind?: "upload" | "remote" | null;
          p_icon_url?: string | null;
          p_storage_path?: string | null;
          p_content_type?: string | null;
          p_file_size_bytes?: number | null;
          p_admin_user_id?: string | null;
          p_admin_email?: string | null;
          p_details?: Record<string, unknown>;
        };
        Returns: {
          previous_source: string | null;
          previous_icon_url: string | null;
          previous_storage_path: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
