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
    Tables: Record<never, never>;
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
