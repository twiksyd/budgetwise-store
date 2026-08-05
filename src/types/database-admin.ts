// Server-only schema surface for the service-role client (src/lib/supabase/admin.ts).
// Deliberately separate from src/types/database.ts (the anon-safe view types) so a
// client component can never accidentally get cost/profit typing from autocomplete.
//
// Row/Insert shapes must be `type` aliases, not `interface` — postgrest-js's
// generic select-string parser fails to resolve interface-declared shapes
// through its conditional types and silently degrades every column to `never`.

type GamepassRow = {
  id: string;
  user_id: string;
  game_id: string;
  name: string;
  robux_amount: number;
  your_price: number;
  your_cost: number;
  is_active: boolean;
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

export type AdminDatabase = {
  public: {
    Tables: {
      gamepasses: {
        Row: GamepassRow;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
