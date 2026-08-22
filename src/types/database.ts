import type {
  GameAvailabilityStatus,
  ProductAvailabilityStatus,
} from "@/types/store-operations";

// Hand-written to match supabase/migrations/0001_store_public_views.sql
// (and 0004_store_operations.sql, which added availability_status).
// Regenerate with `supabase gen types typescript` once the CLI is linked to
// the project, and keep only the store_* views in the Store's type surface.
//
// Must be `type`, not `interface` — postgrest-js's generic select/filter
// parser fails to resolve interface-declared schemas and silently degrades
// results to `never`. See types/database-admin.ts for the same issue on the
// admin client.
//
// Every Views entry needs a `Relationships` array (postgrest-js's
// GenericView requires it structurally). And `Tables` must be
// `Record<never, never>`, NOT `Record<string, never>`: PostgrestClient's
// `.from()` is overloaded on `keyof Schema['Tables']` first, `keyof
// Schema['Views']` second. `Record<string, never>` has a string index
// signature, so it structurally "matches" any table name too — the Tables
// overload wins over the Views overload for every relation name and
// resolves Row to `never`. `Record<never, never>` has no index signature
// (empty keyof), so relation names correctly fall through to the Views
// overload instead.

export type Database = {
  public: {
    Tables: {
      // Store-owned cache table (see
      // supabase/migrations/0006_roblox_gamepass_icon_cache.sql and
      // 0008_roblox_sync_change_tracking.sql) — a real table, not a view,
      // so it's listed here rather than under Views. The Store app only
      // ever reads gamepass_id/icon_url from this (getRobloxIconCache) —
      // the rest of the columns exist for the sync script (plain JS,
      // untyped) and are listed here for completeness/type accuracy.
      roblox_gamepass_icon_cache: {
        Row: {
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
        Insert: {
          gamepass_id: string;
          roblox_universe_id: number;
          status: "matched" | "no_match" | "ambiguous";
          source?: "manual" | "roblox" | null;
          roblox_gamepass_id?: number | null;
          icon_url?: string | null;
          matched_name?: string | null;
          candidate_count?: number;
          synced_at?: string;
          last_verified_at?: string;
          roblox_updated_at?: string | null;
          first_flagged_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["roblox_gamepass_icon_cache"]["Insert"]
        >;
        Relationships: [];
      };
      store_game_presentation: {
        Row: {
          game_id: string;
          sort_order: number;
          is_featured: boolean;
          featured_order: number | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      storefront_presentation_settings: {
        Row: {
          id: boolean;
          featured_game_limit: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_product_sections: {
        Row: {
          id: string;
          game_id: string;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_product_presentation: {
        Row: {
          gamepass_id: string;
          game_id: string;
          section_id: string | null;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_product_display_names: {
        Row: {
          gamepass_id: string;
          game_id: string;
          display_name: string;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_game_card_accent_settings: {
        Row: {
          game_id: string;
          enabled: boolean;
          blur_px: number;
          offset_x_percent: number;
          offset_y_px: number;
          scale_percent: number;
          opacity_percent: number;
          fade_start_percent: number;
          fade_width_percent: number;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      store_games: {
        Row: {
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
        Relationships: [];
      };
      store_gamepasses: {
        Row: {
          id: string;
          game_id: string;
          name: string;
          display_name?: string | null;
          robux_amount: number;
          price: number;
          availability_status: ProductAvailabilityStatus;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type StoreGame = Database["public"]["Views"]["store_games"]["Row"];
export type StoreGamepass =
  Database["public"]["Views"]["store_gamepasses"]["Row"];
