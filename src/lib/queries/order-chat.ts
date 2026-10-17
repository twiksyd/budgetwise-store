import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid, isValidOrderNumber, MESSAGE_RATE_LIMIT } from "@/lib/order-chat.mjs";
import { buildOrderDetails } from "@/lib/chat/order-details.mjs";
import type { OrderDetails } from "@/lib/chat/order-details.mjs";
import { buildFulfillmentView } from "@/lib/chat/fulfillment-fields.mjs";
import type { FulfillmentSlotView } from "@/lib/chat/fulfillment-fields.mjs";
import type { InboxCursor, InboxFilter, InboxRow } from "@/lib/chat/inbox-state.mjs";
import type {
  StoreAdminInboxRpcRow,
  StoreOrderConversationRow,
  StoreOrderMessageRowExport,
  StorePaymentMethodRow,
  StoreQuickReplyRow,
} from "@/types/database-admin";

// Server-only data access for the order chat and the shared admin inbox.
//
// Identity rules:
//   * the acting user id ALWAYS comes from the verified session
//     (supabase.auth.getUser re-validates the JWT); no function here takes a
//     user id from a request body;
//   * every write goes through a SECURITY DEFINER database function that
//     re-checks the actor (admin_users / order ownership) itself.

export const ORDER_CHAT_BUCKET = "order-chat-attachments";
export const PAYMENT_QR_BUCKET = "store-payment-qr";
export const MESSAGE_PAGE_SIZE = 50;
const INBOX_PAGE_SIZE = 30;
const SIGNED_URL_SECONDS = 60;

export type ChatRole = "customer" | "admin";
export type MessageRow = StoreOrderMessageRowExport;

export class ChatDataError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Maps database error codes from our functions to HTTP statuses. */
export function toChatDataError(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "42501":
      return new ChatDataError("Not allowed.", 403);
    case "P0002":
      return new ChatDataError("Not found.", 404);
    case "22023":
    case "23514":
      return new ChatDataError("Invalid request.", 400);
    case "23505":
      return new ChatDataError("That already exists.", 409);
    case "BW010":
      return new ChatDataError("That message was already sent with different content.", 409);
    default:
      return new ChatDataError("Something went wrong. Please try again.", 500);
  }
}

// ------------------------------------------------------------------ identity

export const getSessionUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});

export const isAdminUser = cache(async (userId: string): Promise<boolean> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
});

/** The signed-in admin, or null. */
export async function getSessionAdminId(): Promise<string | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return (await isAdminUser(userId)) ? userId : null;
}

export interface ChatOrder {
  orderNumber: string;
  ownerUserId: string | null;
  buyerName: string;
  buyerRobloxUsername: string;
  totalAmount: number;
  createdAt: string;
}

export async function getChatOrder(orderNumber: string): Promise<ChatOrder | null> {
  if (!isValidOrderNumber(orderNumber)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_snapshots")
    .select(
      "order_number, owner_user_id, buyer_name, buyer_roblox_username, total_amount, created_at",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    orderNumber: data.order_number,
    ownerUserId: data.owner_user_id,
    buyerName: data.buyer_name,
    buyerRobloxUsername: data.buyer_roblox_username,
    totalAmount: Number(data.total_amount),
    createdAt: data.created_at,
  };
}

export type ChatActorResult =
  | { ok: true; role: ChatRole; userId: string; order: ChatOrder }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * The gate for every chat endpoint. `as` is which side the caller wants to
 * act as — a request, never a grant. Unknown orders and other customers'
 * orders answer the same 404.
 */
export async function resolveChatActor(
  orderNumber: string,
  as: ChatRole,
): Promise<ChatActorResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, status: 401, error: "Please sign in first." };

  if (as === "admin" && !(await isAdminUser(userId))) {
    return { ok: false, status: 403, error: "Not allowed." };
  }

  const order = await getChatOrder(orderNumber);
  if (!order) return { ok: false, status: 404, error: "Order not found." };
  if (as === "customer" && order.ownerUserId !== userId) {
    return { ok: false, status: 404, error: "Order not found." };
  }
  return { ok: true, role: as, userId, order };
}

/** Order owner OR any admin (file routes). */
export async function resolveOrderViewer(
  orderNumber: string,
): Promise<{ ok: true; role: ChatRole; userId: string } | { ok: false; status: number }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, status: 401 };
  const order = await getChatOrder(orderNumber);
  if (!order) return { ok: false, status: 404 };
  if (order.ownerUserId === userId) return { ok: true, role: "customer", userId };
  if (await isAdminUser(userId)) return { ok: true, role: "admin", userId };
  return { ok: false, status: 404 };
}

// -------------------------------------------------------------- conversation

export async function getConversation(
  orderNumber: string,
): Promise<StoreOrderConversationRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_conversations")
    .select("*")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------------ messages

export async function listMessages(
  orderNumber: string,
  {
    before,
    after,
    limit = MESSAGE_PAGE_SIZE,
  }: { before?: string | null; after?: string | null; limit?: number } = {},
): Promise<MessageRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_chat_messages_page", {
    p_order_number: orderNumber,
    p_before_message_id: before ?? null,
    p_after_message_id: after ?? null,
    p_limit: limit,
  });
  if (error) throw toChatDataError(error);
  return (data ?? []) as MessageRow[];
}

/** For browser tabs still running the previous build (timestamp cursor). */
export async function listMessagesSinceTimestamp(
  orderNumber: string,
  isoAfter: string,
): Promise<MessageRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_messages")
    .select("*")
    .eq("order_number", orderNumber)
    .gt("created_at", isoAfter)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export async function getMessageInOrder(
  orderNumber: string,
  messageId: string,
): Promise<MessageRow | null> {
  if (!isUuid(messageId)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_messages")
    .select("*")
    .eq("id", messageId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as MessageRow | null) ?? null;
}

export async function getMessageById(messageId: string): Promise<MessageRow | null> {
  if (!isUuid(messageId)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  return (data as MessageRow | null) ?? null;
}

/** Burst limit per sender per order, counted in the database. */
export async function isOverMessageRateLimit(orderNumber: string, userId: string) {
  const since = new Date(Date.now() - MESSAGE_RATE_LIMIT.windowSeconds * 1000).toISOString();
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("store_order_messages")
    .select("id", { count: "exact", head: true })
    .eq("order_number", orderNumber)
    .eq("sender_user_id", userId)
    .gte("created_at", since);
  if (error) throw error;
  return (count ?? 0) >= MESSAGE_RATE_LIMIT.count;
}

export async function postMessage(input: {
  orderNumber: string;
  role: ChatRole;
  userId: string;
  kind: "text" | "image";
  body: string;
  attachmentPath?: string | null;
  attachmentMime?: string | null;
  clientMessageId: string | null;
}): Promise<{ created: boolean; message: MessageRow }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_post_message", {
    p_order_number: input.orderNumber,
    p_sender_role: input.role,
    p_sender: input.userId,
    p_kind: input.kind,
    p_body: input.body,
    p_attachment_path: input.attachmentPath ?? null,
    p_attachment_mime: input.attachmentMime ?? null,
    p_client_message_id: input.clientMessageId,
  });
  if (error) throw toChatDataError(error);
  return data as { created: boolean; message: MessageRow };
}

/**
 * Deterministic path per (order, sender, client message id): a retried
 * upload overwrites the same object instead of creating a second file.
 */
export function attachmentPathFor(input: {
  orderNumber: string;
  userId: string;
  clientMessageId: string;
  extension: string;
}) {
  return `${input.orderNumber}/${input.userId}/${input.clientMessageId}.${input.extension}`;
}

export async function uploadAttachment(path: string, bytes: Uint8Array, mime: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(ORDER_CHAT_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
}

export async function markAdminRead(orderNumber: string, adminId: string, messageId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_mark_admin_read", {
    p_order_number: orderNumber,
    p_admin: adminId,
    p_message_id: messageId,
  });
  if (error) throw toChatDataError(error);
  return data;
}

export async function markCustomerRead(orderNumber: string, messageId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_mark_customer_read", {
    p_order_number: orderNumber,
    p_message_id: messageId,
  });
  if (error) throw toChatDataError(error);
  return data;
}

// ---------------------------------------------------------------- signed URLs

export async function signAttachment(path: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(ORDER_CHAT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export async function signPaymentQr(path: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PAYMENT_QR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

// --------------------------------------------------------------------- inbox

export function toInboxRow(row: StoreAdminInboxRpcRow): InboxRow {
  return {
    conversationId: row.conversation_id,
    orderNumber: row.order_number,
    buyerName: row.buyer_name,
    buyerRobloxUsername: row.buyer_roblox_username,
    totalAmount: Number(row.total_amount),
    orderCreatedAt: row.order_created_at,
    orderStatus: row.order_status,
    assignedAdminId: row.assigned_admin_id,
    assignedAt: row.assigned_at,
    lastMessageId: row.last_message_id,
    lastMessageAt: row.last_message_at,
    lastMessageKind: row.last_message_kind,
    lastMessagePreview: row.last_message_preview,
    lastSenderRole: row.last_sender_role,
    customerReadAt: row.customer_read_at,
    customerReadMessageId: row.customer_read_message_id,
    paymentDetailsSentAt: row.payment_details_sent_at,
    myReadAt: row.my_read_at,
    myReadMessageId: row.my_read_message_id,
    unreadCount: row.unread_count,
  };
}

const INBOX_FILTER_SET = new Set<InboxFilter>([
  "all",
  "unread",
  "unassigned",
  "mine",
  "under_review",
]);

export function parseInboxFilter(value: unknown): InboxFilter {
  return typeof value === "string" && INBOX_FILTER_SET.has(value as InboxFilter)
    ? (value as InboxFilter)
    : "all";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function loadInboxPage(
  adminId: string,
  {
    filter = "all",
    search = "",
    before = null,
  }: { filter?: InboxFilter; search?: string; before?: InboxCursor | null } = {},
): Promise<{ rows: InboxRow[]; hasMore: boolean; nextCursor: InboxCursor | null }> {
  const supabase = createAdminClient();
  const trimmed = search.trim().slice(0, 80);
  const { data, error } = await supabase.rpc("store_admin_inbox", {
    p_admin: adminId,
    p_filter: filter,
    p_search: trimmed ? escapeLike(trimmed) : null,
    p_before_at: before?.at ?? null,
    p_before_order: before?.orderNumber ?? null,
    p_limit: INBOX_PAGE_SIZE + 1,
  });
  if (error) throw toChatDataError(error);
  const all = (data ?? []).map(toInboxRow);
  const rows = all.slice(0, INBOX_PAGE_SIZE);
  const last = rows[rows.length - 1];
  return {
    rows,
    hasMore: all.length > INBOX_PAGE_SIZE,
    nextCursor: all.length > INBOX_PAGE_SIZE && last
      ? { at: last.lastMessageAt, orderNumber: last.orderNumber }
      : null,
  };
}

export async function loadInboxRow(adminId: string, orderNumber: string): Promise<InboxRow | null> {
  if (!isValidOrderNumber(orderNumber)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_admin_inbox", {
    p_admin: adminId,
    p_order_number: orderNumber,
    p_limit: 1,
  });
  if (error) throw toChatDataError(error);
  const row = data?.[0];
  return row ? toInboxRow(row) : null;
}

export async function assignConversation(
  orderNumber: string,
  assigneeId: string | null,
  actorId: string,
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_assign_conversation", {
    p_order_number: orderNumber,
    p_assignee: assigneeId,
    p_actor: actorId,
  });
  if (error) throw toChatDataError(error);
  return data;
}

// ------------------------------------------------------------ admin directory

export interface AdminDirectoryEntry {
  userId: string;
  displayName: string;
  email: string | null;
}

/**
 * The trusted id -> name mapping every admin UI uses for "Sent by Robert",
 * "Andre is typing", assignment. Names come only from admin_users (with the
 * login email's first part as a fallback), never from the browser.
 */
export const loadAdminDirectory = cache(async (): Promise<AdminDirectoryEntry[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id, display_name")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const entries = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: userData } = await supabase.auth.admin.getUserById(row.user_id);
      const email = userData?.user?.email ?? null;
      const fallback = email ? email.split("@")[0] : "Admin";
      return {
        userId: row.user_id,
        displayName: row.display_name?.trim() || fallback,
        email,
      };
    }),
  );
  return entries;
});

// ------------------------------------------------------------- order details

export async function loadOrderLines(orderNumber: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_line_snapshots")
    .select(
      "line_index, game_id, game_name, product_name, quantity, robux_amount, unit_price, line_total, is_via_plus",
    )
    .eq("order_number", orderNumber)
    .order("line_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadFulfillmentRows(orderNumber: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_fulfillment_details")
    .select("line_index, unit_index, field_key, value, external_id, source, updated_at")
    .eq("order_number", orderNumber);
  if (error) throw error;
  return data ?? [];
}

async function loadOrderStatus(orderNumber: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("order_number", orderNumber)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

async function loadViaPlus(orderNumber: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_via_plus_details")
    .select(
      "roblox_display_name, age_16_confirmed, verified_account_confirmed, via_plus_robux_amount",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Admin Order Details panel. Built from order records only — never chat. */
export async function loadOrderDetails(orderNumber: string): Promise<OrderDetails | null> {
  if (!isValidOrderNumber(orderNumber)) return null;
  const supabase = createAdminClient();
  const { data: snapshot, error } = await supabase
    .from("store_order_snapshots")
    .select(
      "order_number, owner_user_id, buyer_name, buyer_roblox_username, total_amount, created_at",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!snapshot) return null;

  const [lines, viaPlus, fulfillmentRows, status, conversation, owner] = await Promise.all([
    loadOrderLines(orderNumber),
    loadViaPlus(orderNumber),
    loadFulfillmentRows(orderNumber),
    loadOrderStatus(orderNumber),
    getConversation(orderNumber),
    snapshot.owner_user_id
      ? supabase.auth.admin.getUserById(snapshot.owner_user_id)
      : Promise.resolve(null),
  ]);

  return buildOrderDetails({
    snapshot,
    lines,
    viaPlus,
    fulfillmentRows,
    status,
    conversation,
    customerEmail: owner?.data?.user?.email ?? null,
  });
}

export interface CustomerFulfillmentSlot extends FulfillmentSlotView {
  productName: string;
  gameName: string;
}

/** The customer's own required details (order page card). */
export async function loadCustomerFulfillment(orderNumber: string): Promise<CustomerFulfillmentSlot[]> {
  const [lines, rows] = await Promise.all([
    loadOrderLines(orderNumber),
    loadFulfillmentRows(orderNumber),
  ]);
  const normalized = lines.map((line) => ({
    lineIndex: line.line_index,
    gameId: line.game_id,
    quantity: Number(line.quantity),
  }));
  const byIndex = new Map(lines.map((line) => [line.line_index, line]));
  return buildFulfillmentView(normalized, rows).map((slot) => ({
    ...slot,
    productName: byIndex.get(slot.lineIndex)?.product_name ?? "",
    gameName: byIndex.get(slot.lineIndex)?.game_name ?? "",
  }));
}

export async function loadFulfillmentLines(orderNumber: string) {
  const lines = await loadOrderLines(orderNumber);
  return lines.map((line) => ({
    lineIndex: line.line_index,
    gameId: line.game_id,
    quantity: Number(line.quantity),
  }));
}

export async function saveFulfillmentDetail(input: {
  orderNumber: string;
  lineIndex: number;
  unitIndex: number;
  fieldKey: string;
  value: string;
  externalId: string;
  actorId: string;
  actorRole: ChatRole;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_set_fulfillment_detail", {
    p_order_number: input.orderNumber,
    p_line_index: input.lineIndex,
    p_unit_index: input.unitIndex,
    p_field_key: input.fieldKey,
    p_value: input.value,
    p_external_id: input.externalId,
    p_actor: input.actorId,
    p_actor_role: input.actorRole,
  });
  if (error) throw toChatDataError(error);
  return data;
}

// ------------------------------------------------------------- quick replies

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  isEnabled: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function toQuickReply(row: StoreQuickReplyRow): QuickReply {
  return {
    id: row.id,
    shortcut: row.shortcut,
    title: row.title,
    body: row.body,
    isEnabled: row.is_enabled,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listQuickReplies(): Promise<QuickReply[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_quick_replies")
    .select("*")
    .order("shortcut", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toQuickReply);
}

export async function saveQuickReply(
  actorId: string,
  input: { id: string | null; shortcut: string; title: string; body: string; isEnabled: boolean },
): Promise<QuickReply> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_save_quick_reply", {
    p_actor: actorId,
    p_id: input.id,
    p_shortcut: input.shortcut,
    p_title: input.title,
    p_body: input.body,
    p_is_enabled: input.isEnabled,
  });
  if (error) {
    if (error.code === "23505") {
      throw new ChatDataError(`The shortcut /${input.shortcut.toLowerCase()} is already used.`, 409);
    }
    throw toChatDataError(error);
  }
  return toQuickReply(data as StoreQuickReplyRow);
}

// ----------------------------------------------------------- payment methods

export interface PaymentMethod {
  id: string;
  provider: "gcash";
  label: string;
  accountName: string;
  accountNumber: string;
  hasQr: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

/** Admin-facing shape: never includes the storage path. */
function toPaymentMethod(row: StorePaymentMethodRow): PaymentMethod {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    accountName: row.account_name,
    accountNumber: row.account_number,
    hasQr: Boolean(row.qr_storage_path),
    isActive: row.is_active,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

async function getPaymentMethodRow(id: string): Promise<StorePaymentMethodRow | null> {
  if (!isUuid(id)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_payment_methods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listPaymentMethods({ activeOnly = false } = {}): Promise<PaymentMethod[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("store_payment_methods")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toPaymentMethod);
}

/** QR files get a fresh random name every upload and are never overwritten. */
export async function uploadPaymentQr(bytes: Uint8Array, mime: string, extension: string) {
  const path = `qr/${crypto.randomUUID()}.${extension}`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(PAYMENT_QR_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}

export async function savePaymentMethod(
  actorId: string,
  input: {
    id: string | null;
    label: string;
    accountName: string;
    accountNumber: string;
    newQrPath: string | null;
    removeQr: boolean;
    isActive: boolean;
    sortOrder: number;
  },
): Promise<PaymentMethod> {
  const existing = input.id ? await getPaymentMethodRow(input.id) : null;
  if (input.id && !existing) throw new ChatDataError("Not found.", 404);
  const qrPath = input.newQrPath ?? (input.removeQr ? null : existing?.qr_storage_path ?? null);

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_save_payment_method", {
    p_actor: actorId,
    p_id: input.id,
    p_label: input.label,
    p_account_name: input.accountName,
    p_account_number: input.accountNumber,
    p_qr_storage_path: qrPath,
    p_is_active: input.isActive,
    p_sort_order: input.sortOrder,
  });
  if (error) throw toChatDataError(error);
  return toPaymentMethod(data as StorePaymentMethodRow);
}

/** Admin preview of a configured QR (the payment settings page). */
export async function signPaymentMethodQr(id: string): Promise<string | null> {
  const row = await getPaymentMethodRow(id);
  if (!row?.qr_storage_path) return null;
  return signPaymentQr(row.qr_storage_path);
}

export async function sendPaymentDetails(input: {
  orderNumber: string;
  actorId: string;
  methodId: string;
  clientMessageId: string;
}): Promise<MessageRow> {
  const supabase = createAdminClient();
  const { data: messageId, error } = await supabase.rpc("store_send_payment_details", {
    p_order_number: input.orderNumber,
    p_actor: input.actorId,
    p_method_id: input.methodId,
    p_client_message_id: input.clientMessageId,
  });
  if (error) throw toChatDataError(error);
  const message = await getMessageInOrder(input.orderNumber, messageId as string);
  if (!message) throw new ChatDataError("Not found.", 404);
  return message;
}

// ------------------------------------------------------------------ customer

export interface CustomerOrderListItem {
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessageKind: "slip" | "text" | "image" | "payment" | null;
  lastMessagePreview: string | null;
  lastSenderRole: ChatRole | null;
}

async function loadOrderStatuses(orderNumbers: string[]) {
  const statusByOrder = new Map<string, string>();
  if (orderNumbers.length === 0) return statusByOrder;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("order_number, status")
    .in("order_number", orderNumbers);
  if (error) throw error;
  for (const row of data ?? []) {
    if (!statusByOrder.has(row.order_number)) statusByOrder.set(row.order_number, row.status);
  }
  return statusByOrder;
}

export async function listCustomerOrders(userId: string): Promise<CustomerOrderListItem[]> {
  const supabase = createAdminClient();
  const [{ data: orders, error }, { data: conversations, error: conversationError }] =
    await Promise.all([
      supabase
        .from("store_order_snapshots")
        .select("order_number, total_amount, created_at")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.rpc("store_customer_conversations", { p_user: userId }),
    ]);
  if (error) throw error;
  if (conversationError) throw toChatDataError(conversationError);
  if (!orders || orders.length === 0) return [];

  const statusByOrder = await loadOrderStatuses(orders.map((order) => order.order_number));
  const conversationByOrder = new Map(
    (conversations ?? []).map((conversation) => [conversation.order_number, conversation]),
  );

  return orders.map((order) => {
    const conversation = conversationByOrder.get(order.order_number);
    return {
      orderNumber: order.order_number,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
      status: statusByOrder.get(order.order_number) ?? "pending",
      unreadCount: conversation?.unread_count ?? 0,
      lastMessageAt: conversation?.last_message_at ?? null,
      lastMessageKind: conversation?.last_message_kind ?? null,
      lastMessagePreview: conversation?.last_message_preview ?? null,
      lastSenderRole: conversation?.last_sender_role ?? null,
    };
  });
}

export async function getOrderStatus(orderNumber: string) {
  return (await loadOrderStatus(orderNumber)) ?? "pending";
}

/**
 * Ties a freshly created order to the signed-in account and posts the order
 * slip as the first message. Safe to run again for a replayed checkout: the
 * owner is only set while empty, and the slip is unique per order.
 * Returns false when the order already belongs to a different account.
 */
export async function attachOrderOwnerAndSlip({
  orderNumber,
  userId,
  slipText,
}: {
  orderNumber: string;
  userId: string;
  slipText: string;
}): Promise<boolean> {
  const supabase = createAdminClient();

  const { error: ownerError } = await supabase
    .from("store_order_snapshots")
    .update({ owner_user_id: userId })
    .eq("order_number", orderNumber)
    .is("owner_user_id", null);
  if (ownerError) throw ownerError;

  const order = await getChatOrder(orderNumber);
  if (!order || order.ownerUserId !== userId) return false;

  const { error: slipError } = await supabase.from("store_order_messages").insert({
    order_number: orderNumber,
    sender_role: "customer",
    sender_user_id: userId,
    kind: "slip",
    body: slipText,
  });
  // 23505 = the one-slip-per-order index: the slip is already there.
  if (slipError && slipError.code !== "23505") throw slipError;
  return true;
}
