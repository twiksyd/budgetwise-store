// Hand-written to match supabase/migrations/0001_store_public_views.sql.
// Regenerate with `supabase gen types typescript` once the CLI is linked to
// the project, and keep only the store_* views in the Store's type surface.

export interface Database {
  public: {
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
        };
      };
      store_gamepasses: {
        Row: {
          id: string;
          game_id: string;
          name: string;
          robux_amount: number;
          price: number;
        };
      };
    };
  };
}

export type StoreGame = Database["public"]["Views"]["store_games"]["Row"];
export type StoreGamepass =
  Database["public"]["Views"]["store_gamepasses"]["Row"];
