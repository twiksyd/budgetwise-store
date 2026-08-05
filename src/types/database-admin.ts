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
  category: string | null;
  sort_order: number | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
