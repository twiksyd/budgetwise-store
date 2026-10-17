// Server-only schema surface for the service-role client (src/lib/supabase/admin.ts).
// Deliberately separate from src/types/database.ts (the anon-safe view types) so a
// client component can never accidentally get cost/profit typing from autocomplete.
//
// Row/Insert shapes must be `type` aliases, not `interface` — postgrest-js's
// generic select-string parser fails to resolve interface-declared shapes
// through its conditional types and silently degrades every column to `never`.

import type { OrderSnapshotLine } from "@/lib/order-snapshot.mjs";
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

type StoreGamePresentationRow = {
  game_id: string;
  sort_order: number;
  is_featured: boolean;
  featured_order: number | null;
  updated_at: string;
  updated_by: string | null;
};

type StorefrontPresentationSettingsRow = {
  id: boolean;
  featured_game_limit: number;
  updated_at: string;
  updated_by: string | null;
};

type StorefrontPresentationAuditLogRow = {
  id: string;
  action:
    | "update_game_order"
    | "update_featured_games"
    | "reset_game_order"
    | "update_product_layout"
    | "reset_product_layout"
    | "update_product_display_name"
    | "reset_product_display_name"
    | "update_game_card_accent"
    | "reset_game_card_accent";
  admin_user_id: string | null;
  admin_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type StoreProductSectionRow = {
  id: string;
  game_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type StoreProductPresentationRow = {
  gamepass_id: string;
  game_id: string;
  section_id: string | null;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
};

type StoreProductDisplayNameRow = {
  gamepass_id: string;
  game_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type StoreGameCardAccentSettingsRow = {
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
  // Migration 0021.
  display_name: string | null;
  unread_since: string;
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
  // Snapshotted at write time so an override orphaned by an upstream
  // gamepass_id change (see migration 0011) can be name-matched back to its
  // replacement instead of becoming unrecoverable.
  product_name: string | null;
  game_id: string | null;
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
  product_name?: string | null;
  game_id?: string | null;
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
    | "restore_placeholder"
    | "relink";
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

type StoreOrderViaPlusDetailsRow = {
  order_number: string;
  roblox_display_name: string;
  age_16_confirmed: boolean;
  verified_account_confirmed: boolean;
  via_plus_robux_amount: number;
  created_at: string;
};

type StoreOrderViaPlusDetailsInsert = {
  order_number: string;
  roblox_display_name: string;
  age_16_confirmed: boolean;
  verified_account_confirmed: boolean;
  via_plus_robux_amount: number;
  created_at?: string;
};

type StoreOrderSnapshotRow = {
  order_number: string;
  idempotency_key: string;
  request_fingerprint: string;
  view_token_hash: string;
  buyer_name: string;
  buyer_roblox_username: string;
  total_amount: number;
  // Supabase Auth account that placed the order (migration 0020). Null for
  // orders created before customer accounts existed.
  owner_user_id: string | null;
  created_at: string;
};

type StoreOrderMessageKind = "slip" | "text" | "image" | "payment" | "album";

type StoreOrderMessageRow = {
  id: string;
  order_number: string;
  sender_role: "customer" | "admin";
  sender_user_id: string | null;
  kind: StoreOrderMessageKind;
  body: string;
  attachment_path: string | null;
  attachment_mime: string | null;
  created_at: string;
  read_at: string | null;
  // Migration 0021.
  client_message_id: string | null;
  payload: Record<string, unknown> | null;
};

type StoreOrderMessageInsert = {
  id?: string;
  order_number: string;
  sender_role: "customer" | "admin";
  sender_user_id: string | null;
  kind: StoreOrderMessageKind;
  body: string;
  attachment_path?: string | null;
  attachment_mime?: string | null;
};

type StoreOrderMessageUpdate = {
  read_at?: string | null;
};

type StoreOrderSnapshotUpdate = {
  owner_user_id?: string | null;
};

// ----- Migration 0021: shared admin inbox --------------------------------

export type StoreOrderConversationRow = {
  order_number: string;
  id: string;
  assigned_admin_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  last_message_id: string;
  last_message_at: string;
  last_message_kind: StoreOrderMessageKind;
  last_message_preview: string;
  last_sender_role: "customer" | "admin";
  customer_read_at: string | null;
  customer_read_message_id: string | null;
  admin_read_at: string | null;
  admin_read_message_id: string | null;
  payment_details_sent_at: string | null;
  created_at: string;
  updated_at: string;
  // Migration 0024: BudgetWise's own workflow state (NOT XOB orders.status).
  state: ConversationState;
  done_at: string | null;
  done_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
};

// Migration 0024.
export type ConversationState = "active" | "done";

export type StoreOrderMessageAttachmentRow = {
  id: string;
  message_id: string;
  order_number: string;
  position: number;
  storage_path: string;
  mime: string;
  byte_size: number;
  thumb_path: string;
  thumb_mime: string;
  width: number | null;
  height: number | null;
  created_at: string;
};

export type StoreCustomerOrderRpcRow = {
  order_number: string;
  total_amount: number;
  created_at: string;
  buyer_roblox_username: string;
  conversation_id: string | null;
  state: ConversationState;
  done_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_role: "customer" | "admin" | null;
  payment_details_sent_at: string | null;
  unread_count: number;
};

export type StoreQuickReplyRow = {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  is_enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StorePaymentMethodRow = {
  id: string;
  provider: "gcash";
  label: string;
  account_name: string;
  account_number: string;
  qr_storage_path: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// Migration 0022.
export type StoreOrderFulfillmentDetailRow = {
  id: string;
  order_number: string;
  line_index: number | null;
  unit_index: number;
  field_key: string;
  value: string;
  external_id: string | null;
  source: "customer" | "admin";
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreAdminInboxRpcRow = {
  conversation_id: string;
  order_number: string;
  buyer_name: string;
  buyer_roblox_username: string;
  total_amount: number;
  order_created_at: string;
  order_status: string | null;
  assigned_admin_id: string | null;
  assigned_at: string | null;
  last_message_id: string;
  last_message_at: string;
  last_message_kind: StoreOrderMessageKind;
  last_message_preview: string;
  last_sender_role: "customer" | "admin";
  customer_read_at: string | null;
  customer_read_message_id: string | null;
  payment_details_sent_at: string | null;
  my_read_at: string | null;
  my_read_message_id: string | null;
  unread_count: number;
  // Migration 0024.
  state: ConversationState;
  done_at: string | null;
  done_by: string | null;
};

export type StoreCustomerConversationRpcRow = {
  conversation_id: string;
  order_number: string;
  last_message_at: string;
  last_message_kind: StoreOrderMessageKind;
  last_message_preview: string;
  last_sender_role: "customer" | "admin";
  payment_details_sent_at: string | null;
  unread_count: number;
  // Migration 0024.
  state: ConversationState;
  done_at: string | null;
};

export type StoreOrderMessageRowExport = StoreOrderMessageRow;

export type AlbumAttachmentInput = {
  position: number;
  path: string;
  mime: string;
  size: number;
  thumb_path: string;
  thumb_mime: string;
  width: number | null;
  height: number | null;
};

type StoreOrderLineSnapshotRow = {
  id: string;
  order_number: string;
  line_index: number;
  gamepass_id: string | null;
  game_id: string | null;
  product_name: string;
  game_name: string;
  robux_amount: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_via_plus: boolean;
  created_at: string;
};

type StoreProductCardBackgroundRow = {
  gamepass_id: string;
  image_url: string;
  storage_path: string;
  content_type: string;
  file_size_bytes: number;
  product_name: string | null;
  game_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type StoreProductCardBackgroundInsert = {
  gamepass_id: string;
  image_url: string;
  storage_path: string;
  content_type: string;
  file_size_bytes: number;
  product_name?: string | null;
  game_id?: string | null;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
};

type StoreProductCardBackgroundUpdate = Partial<
  Omit<StoreProductCardBackgroundInsert, "gamepass_id">
>;

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
  display_name?: string | null;
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
      store_game_presentation: {
        Row: StoreGamePresentationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      storefront_presentation_settings: {
        Row: StorefrontPresentationSettingsRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      storefront_presentation_audit_log: {
        Row: StorefrontPresentationAuditLogRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_product_sections: {
        Row: StoreProductSectionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_product_presentation: {
        Row: StoreProductPresentationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_product_display_names: {
        Row: StoreProductDisplayNameRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_game_card_accent_settings: {
        Row: StoreGameCardAccentSettingsRow;
        Insert: never;
        Update: never;
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
      store_order_via_plus_details: {
        Row: StoreOrderViaPlusDetailsRow;
        Insert: StoreOrderViaPlusDetailsInsert;
        Update: never;
        Relationships: [];
      };
      // Written only by the create_store_order RPC (migration 0019), which
      // is what keeps one logical order atomic — hence Insert: never here.
      store_order_snapshots: {
        Row: StoreOrderSnapshotRow;
        Insert: never;
        // Only the owner may be set after creation (and only while unset —
        // see attachOrderOwner), never the contents of the slip.
        Update: StoreOrderSnapshotUpdate;
        Relationships: [];
      };
      store_order_messages: {
        Row: StoreOrderMessageRow;
        Insert: StoreOrderMessageInsert;
        Update: StoreOrderMessageUpdate;
        Relationships: [];
      };
      // 0021/0022 tables: read directly by server code; every write goes
      // through a SECURITY DEFINER function (Insert/Update: never).
      store_order_conversations: {
        Row: StoreOrderConversationRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_order_message_attachments: {
        Row: StoreOrderMessageAttachmentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_quick_replies: {
        Row: StoreQuickReplyRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_payment_methods: {
        Row: StorePaymentMethodRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_order_fulfillment_details: {
        Row: StoreOrderFulfillmentDetailRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_order_line_snapshots: {
        Row: StoreOrderLineSnapshotRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      store_product_card_backgrounds: {
        Row: StoreProductCardBackgroundRow;
        Insert: StoreProductCardBackgroundInsert;
        Update: StoreProductCardBackgroundUpdate;
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
      store_admin_inbox: {
        Args: {
          p_admin: string;
          p_filter?: string;
          p_search?: string | null;
          p_before_at?: string | null;
          p_before_order?: string | null;
          p_limit?: number;
          p_order_number?: string | null;
        };
        Returns: StoreAdminInboxRpcRow[];
      };
      store_customer_conversations: {
        Args: { p_user: string };
        Returns: StoreCustomerConversationRpcRow[];
      };
      store_customer_orders: {
        Args: {
          p_user: string;
          p_section: "open" | "completed";
          p_before_at?: string | null;
          p_before_order?: string | null;
          p_limit?: number;
        };
        Returns: StoreCustomerOrderRpcRow[];
      };
      store_set_conversation_state: {
        Args: {
          p_order_number: string;
          p_actor: string;
          p_state: ConversationState;
          p_last_seen_message_id: string | null;
        };
        Returns: Omit<StoreOrderConversationRow, "admin_read_at" | "admin_read_message_id">;
      };
      store_post_album: {
        Args: {
          p_order_number: string;
          p_sender_role: "customer" | "admin";
          p_sender: string;
          p_body: string;
          p_label: "proof_of_delivery" | null;
          p_attachments: AlbumAttachmentInput[];
          p_client_message_id: string;
        };
        Returns: { created: boolean; message: StoreOrderMessageRow };
      };
      store_chat_messages_page: {
        Args: {
          p_order_number: string;
          p_before_message_id?: string | null;
          p_after_message_id?: string | null;
          p_limit?: number;
        };
        Returns: StoreOrderMessageRow[];
      };
      store_post_message: {
        Args: {
          p_order_number: string;
          p_sender_role: "customer" | "admin";
          p_sender: string;
          p_kind: "text" | "image";
          p_body: string;
          p_attachment_path: string | null;
          p_attachment_mime: string | null;
          p_client_message_id: string | null;
        };
        Returns: { created: boolean; message: StoreOrderMessageRow };
      };
      store_mark_admin_read: {
        Args: { p_order_number: string; p_admin: string; p_message_id: string };
        Returns: { last_read_at: string; last_read_message_id: string };
      };
      store_mark_customer_read: {
        Args: { p_order_number: string; p_message_id: string };
        Returns: { customer_read_at: string; customer_read_message_id: string };
      };
      store_assign_conversation: {
        Args: { p_order_number: string; p_assignee: string | null; p_actor: string };
        Returns: {
          conversation_id: string;
          order_number: string;
          assigned_admin_id: string | null;
          assigned_by: string | null;
          assigned_at: string | null;
        };
      };
      store_save_quick_reply: {
        Args: {
          p_actor: string;
          p_id: string | null;
          p_shortcut: string;
          p_title: string;
          p_body: string;
          p_is_enabled: boolean;
        };
        Returns: StoreQuickReplyRow;
      };
      store_save_payment_method: {
        Args: {
          p_actor: string;
          p_id: string | null;
          p_label: string;
          p_account_name: string;
          p_account_number: string;
          p_qr_storage_path: string | null;
          p_is_active: boolean;
          p_sort_order?: number;
        };
        Returns: StorePaymentMethodRow;
      };
      store_send_payment_details: {
        Args: {
          p_order_number: string;
          p_actor: string;
          p_method_id: string;
          p_client_message_id: string;
        };
        Returns: string;
      };
      store_set_fulfillment_detail: {
        Args: {
          p_order_number: string;
          p_line_index: number | null;
          p_unit_index: number;
          p_field_key: string;
          p_value: string;
          p_external_id: string | null;
          p_actor: string;
          p_actor_role: "customer" | "admin";
        };
        Returns: StoreOrderFulfillmentDetailRow;
      };
      create_store_order: {
        Args: {
          p_idempotency_key: string;
          p_request_fingerprint: string;
          p_view_token_hash: string;
          p_order_number: string;
          p_buyer_name: string;
          p_buyer_roblox_username: string;
          p_total_amount: number;
          p_lines: OrderSnapshotLine[];
          p_via_plus: {
            roblox_display_name: string;
            age_16_confirmed: boolean;
            verified_account_confirmed: boolean;
            via_plus_robux_amount: number;
          } | null;
        };
        Returns: {
          order_number: string;
          replayed: boolean;
        };
      };
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
          p_product_name?: string | null;
          p_game_id?: string | null;
        };
        Returns: {
          previous_source: string | null;
          previous_icon_url: string | null;
          previous_storage_path: string | null;
        }[];
      };
      relink_product_artwork_override: {
        Args: {
          p_old_gamepass_id: string;
          p_new_gamepass_id: string;
          p_product_name?: string | null;
          p_game_id?: string | null;
          p_admin_user_id?: string | null;
          p_admin_email?: string | null;
        };
        Returns: {
          relinked_source: string | null;
          relinked_icon_url: string | null;
        }[];
      };
      apply_store_game_order: {
        Args: {
          p_game_ids: string[];
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
      apply_featured_games: {
        Args: {
          p_featured_game_ids: string[];
          p_featured_game_limit: number;
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
      reset_store_game_order: {
        Args: {
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
      apply_store_product_layout: {
        Args: {
          p_game_id: string;
          p_sections: Array<{
            id: string;
            name: string;
            sort_order: number;
          }>;
          p_products: Array<{
            gamepass_id: string;
            section_id: string | null;
            sort_order: number;
          }>;
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
      reset_store_product_layout: {
        Args: {
          p_game_id: string;
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
      apply_store_product_display_name: {
        Args: {
          p_gamepass_id: string;
          p_display_name: string | null;
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
      apply_store_game_card_accent_settings: {
        Args: {
          p_game_id: string;
          p_enabled: boolean;
          p_blur_px: number;
          p_offset_x_percent: number;
          p_offset_y_px: number;
          p_scale_percent: number;
          p_opacity_percent: number;
          p_fade_start_percent: number;
          p_fade_width_percent: number;
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
      reset_store_game_card_accent_settings: {
        Args: {
          p_game_id: string;
          p_admin_user_id: string;
          p_admin_email: string | null;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
