import "server-only";
import { createHmac } from "node:crypto";
import { cache } from "react";
import { safeGooglePhotoUrl } from "@/lib/chat/customer-avatar.mjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isInquiryKey, isUuid, isValidOrderNumber, MESSAGE_RATE_LIMIT } from "@/lib/order-chat.mjs";
import { buildOrderDetails } from "@/lib/chat/order-details.mjs";
import type { OrderDetails } from "@/lib/chat/order-details.mjs";
import { buildFulfillmentView } from "@/lib/chat/fulfillment-fields.mjs";
import type { FulfillmentSlotView } from "@/lib/chat/fulfillment-fields.mjs";
import { INBOX_FILTERS } from "@/lib/chat/inbox-state.mjs";
import type { InboxCursor, InboxFilter, InboxRow } from "@/lib/chat/inbox-state.mjs";
import { toChatMessage, type AttachmentRowLike, type ChatMessageDto } from "@/lib/chat/dto.mjs";
import { summarizeReactions } from "@/lib/chat/message-meta.mjs";
import { describeOrderItems, summarizeLines, type SummaryLine } from "@/lib/chat/order-summary.mjs";
import { getProductArtworkMapSafe, getProductArtworkUrlMap } from "@/lib/queries/product-artwork";
import type {
  AlbumAttachmentInput,
  ConversationState,
  StoreAdminInboxRpcRow,
  StoreOrderConversationRow,
  StoreOrderMessageAttachmentRow,
  StoreOrderMessageRowExport,
  StorePaymentConfirmationRow,
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
    case "BW011":
      return new ChatDataError("The customer just sent a new message. Read it before marking this Done.", 409);
    case "BW012":
      return new ChatDataError("These photos took too long to send. Please choose them again.", 410);
    case "BW020":
      return new ChatDataError("Newer payment details were sent. Confirm the latest payment card instead.", 409);
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

export interface ChatInquiry {
  key: string;
  ownerUserId: string;
  customerName: string | null;
  createdAt: string;
}

/** A customer's General Inquiry thread (migration 0026), by its GI- key. */
export async function getChatInquiry(key: string): Promise<ChatInquiry | null> {
  if (!isInquiryKey(key)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_chat_threads")
    .select("key, owner_user_id, customer_name, created_at")
    .eq("key", key)
    .eq("kind", "inquiry")
    .maybeSingle();
  if (error) throw error;
  if (!data?.owner_user_id) return null;
  return { key: data.key, ownerUserId: data.owner_user_id, customerName: data.customer_name, createdAt: data.created_at };
}

/**
 * Any chat thread as the gates below see it: an order, or a General Inquiry
 * presented with the same shape (no Roblox username, no total). `kind` says
 * which; order-only features check it.
 */
export async function getChatThread(key: string): Promise<(ChatOrder & { kind: "order" | "inquiry" }) | null> {
  if (isInquiryKey(key)) {
    const inquiry = await getChatInquiry(key);
    if (!inquiry) return null;
    return {
      kind: "inquiry",
      orderNumber: inquiry.key,
      ownerUserId: inquiry.ownerUserId,
      buyerName: inquiry.customerName ?? "Customer",
      buyerRobloxUsername: "",
      totalAmount: 0,
      createdAt: inquiry.createdAt,
    };
  }
  const order = await getChatOrder(key);
  return order ? { ...order, kind: "order" } : null;
}

/** The signed-in customer's one General Inquiry: returned, or created on first use. */
export async function openCustomerInquiry(userId: string, name: string | null): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_open_inquiry", { p_user: userId, p_name: name });
  if (error) throw toChatDataError(error);
  return data as string;
}

export type ChatActorResult =
  | { ok: true; role: ChatRole; userId: string; order: ChatOrder & { kind: "order" | "inquiry" } }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * The gate for every chat endpoint. `as` is which side the caller wants to
 * act as — a request, never a grant. Unknown chats and other customers'
 * chats (orders or General Inquiries) answer the same 404.
 */
export async function resolveChatActor(
  orderNumber: string,
  as: ChatRole,
): Promise<ChatActorResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, status: 401, error: "Please sign in first." };

  // Both lookups depend only on the verified user id: run them together.
  // Nothing about the chat is returned unless the checks below pass.
  const [isAdmin, order] = await Promise.all([
    as === "admin" ? isAdminUser(userId) : Promise.resolve(false),
    getChatThread(orderNumber),
  ]);
  if (as === "admin" && !isAdmin) {
    return { ok: false, status: 403, error: "Not allowed." };
  }
  if (!order) return { ok: false, status: 404, error: "Order not found." };
  if (as === "customer" && order.ownerUserId !== userId) {
    return { ok: false, status: 404, error: "Order not found." };
  }
  return { ok: true, role: as, userId, order };
}

/** Chat owner (order or General Inquiry) OR any admin (file routes). */
export async function resolveOrderViewer(
  orderNumber: string,
): Promise<{ ok: true; role: ChatRole; userId: string } | { ok: false; status: number }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, status: 401 };
  const order = await getChatThread(orderNumber);
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

// ------------------------------------------------ customer-facing identity

const PUBLIC_NAMES_TTL_MS = 60_000;
let publicNamesCache: { at: number; names: Map<string, string> } | null = null;

/**
 * Admin user id -> public username (admin_users.public_username, migration
 * 0025): the only admin identity a customer ever sees. Read with select * so
 * it keeps working, as an empty map, before 0025 adds the column. Never
 * throws: without names the customer simply sees "BudgetWise".
 */
export async function loadPublicAdminNames(): Promise<Map<string, string>> {
  if (publicNamesCache && Date.now() - publicNamesCache.at < PUBLIC_NAMES_TTL_MS) return publicNamesCache.names;
  const names = new Map<string, string>();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("admin_users").select("*");
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ user_id: string; public_username?: unknown }>) {
      const name = typeof row.public_username === "string" ? row.public_username.trim() : "";
      if (name) names.set(row.user_id, name);
    }
    publicNamesCache = { at: Date.now(), names };
  } catch (error) {
    console.error("Load public admin names failed", error);
  }
  return names;
}

/** The admin who sent the newest admin message on this order (server-side only). */
export async function lastAdminSenderId(orderNumber: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_messages")
    .select("sender_user_id")
    .eq("order_number", orderNumber)
    .eq("sender_role", "admin")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.sender_user_id ?? null;
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
/** Attachment rows of album messages, keyed by message id (one query). */
export async function loadAlbumAttachments(
  messageIds: string[],
): Promise<Map<string, StoreOrderMessageAttachmentRow[]>> {
  const byMessage = new Map<string, StoreOrderMessageAttachmentRow[]>();
  if (messageIds.length === 0) return byMessage;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_message_attachments")
    .select("*")
    .in("message_id", messageIds)
    .order("position", { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push(row);
    byMessage.set(row.message_id, list);
  }
  return byMessage;
}

/** Before 0027 is applied the table does not exist: nothing is confirmed. */
function isMissingRelation(error: { code?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}

/** Confirmations of payment messages, keyed by message id (one query). */
export async function loadPaymentConfirmations(
  messageIds: string[],
): Promise<Map<string, StorePaymentConfirmationRow>> {
  const byMessage = new Map<string, StorePaymentConfirmationRow>();
  if (messageIds.length === 0) return byMessage;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_payment_confirmations")
    .select("*")
    .in("message_id", messageIds);
  if (error) {
    if (isMissingRelation(error)) return byMessage;
    throw error;
  }
  for (const row of data ?? []) byMessage.set(row.message_id, row);
  return byMessage;
}

/** 0032: reaction rows for these messages (one query; none before 0032). */
async function loadReactionRows(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_message_reactions")
    .select("message_id, actor_user_id, reaction")
    .in("message_id", messageIds);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return data ?? [];
}

/**
 * 0032: originals quoted by replies on this page that are not on the page
 * themselves — one query, and only from the same conversation.
 */
async function loadReplyTargets(orderNumber: string, ids: string[]): Promise<MessageRow[]> {
  if (ids.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_messages")
    .select("*")
    .eq("order_number", orderNumber)
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

/**
 * Rows -> DTOs for one viewer, with album items, payment confirmations,
 * reactions and reply quotes (each a single batched query, skipped when the
 * page has nothing of that kind).
 */
export async function toChatMessages(
  rows: MessageRow[],
  viewer: { viewer: ChatRole; viewerUserId: string },
): Promise<ChatMessageDto[]> {
  const albumIds = rows.filter((row) => row.kind === "album").map((row) => row.id);
  const paymentIds = rows.filter((row) => row.kind === "payment").map((row) => row.id);
  const onPage = new Map(rows.map((row) => [row.id, row]));
  const quoted = [...new Set(rows.map((row) => row.reply_to_message_id).filter((id): id is string => Boolean(id)))];
  const missingQuoted = quoted.filter((id) => !onPage.has(id));
  // Customers see an admin message's public username only (no id, no real name).
  const needsNames =
    viewer.viewer === "customer" && (rows.some((row) => row.sender_role === "admin") || quoted.length > 0);
  const [attachments, publicNames, paymentConfirmations, reactionRows, fetchedTargets] = await Promise.all([
    loadAlbumAttachments(albumIds) as Promise<Map<string, AttachmentRowLike[]>>,
    needsNames ? loadPublicAdminNames() : Promise.resolve(undefined),
    loadPaymentConfirmations(paymentIds),
    loadReactionRows(rows.map((row) => row.id)),
    rows.length ? loadReplyTargets(rows[0].order_number, missingQuoted) : Promise.resolve([]),
  ]);
  const replyTargets = new Map<string, MessageRow>();
  for (const id of quoted) {
    const target = onPage.get(id) ?? fetchedTargets.find((row) => row.id === id);
    if (target) replyTargets.set(id, target);
  }
  // Photo counts for quoted albums (on the page: already loaded).
  const albumCounts = new Map<string, number>();
  const offPageAlbums = fetchedTargets.filter((row) => row.kind === "album").map((row) => row.id);
  const offPageAttachments = offPageAlbums.length ? await loadAlbumAttachments(offPageAlbums) : new Map();
  for (const [id, list] of [...attachments, ...offPageAttachments]) albumCounts.set(id, list.length);
  const reactions = summarizeReactions(reactionRows, viewer.viewerUserId);
  return rows.map((row) =>
    toChatMessage(row, { ...viewer, attachments, publicNames, paymentConfirmations, reactions, replyTargets, albumCounts }),
  );
}

/** 0032: set (or with null, remove) my reaction on one message. */
export async function setReaction(input: {
  orderNumber: string;
  messageId: string;
  actorId: string;
  role: ChatRole;
  reaction: string | null;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_set_reaction", {
    p_order_number: input.orderNumber,
    p_message_id: input.messageId,
    p_actor: input.actorId,
    p_role: input.role,
    p_reaction: input.reaction,
  });
  if (error) throw toChatDataError(error);
  return data as { counts: Record<string, number>; customer: string | null; admins: Record<string, string> };
}

export async function getAttachment(id: string): Promise<StoreOrderMessageAttachmentRow | null> {
  if (!isUuid(id)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_message_attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

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
  /** 0032: the message this one replies to (same conversation, checked by the database). */
  replyTo?: string | null;
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
    // Only sent for replies, so plain messages work the same before 0032.
    ...(input.replyTo ? { p_reply_to: input.replyTo } : {}),
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

/**
 * Album files: <order>/<sender>/<client message id>/<position>.<ext> and
 * <position>.thumb.<ext>. Deterministic, so a retried upload overwrites the
 * same object, and the database re-checks the prefix belongs to the sender.
 */
export function albumFolderFor(input: { orderNumber: string; userId: string; clientMessageId: string }) {
  return `${input.orderNumber}/${input.userId}/${input.clientMessageId}/`;
}

export interface AlbumUpload {
  position: number;
  path: string;
  mime: string;
  size: number;
  thumbPath: string | null;
  thumbMime: string | null;
}

const EXTENSION_MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** What has been uploaded (and validated by our upload route) for one album. */
export async function listAlbumUploads(folder: string): Promise<Map<number, AlbumUpload>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(ORDER_CHAT_BUCKET)
    .list(folder.replace(/\/$/, ""), { limit: 100 });
  if (error) throw error;
  const uploads = new Map<number, AlbumUpload>();
  for (const object of data ?? []) {
    const match = /^(\d)(\.thumb)?\.(jpg|png|webp)$/.exec(object.name);
    if (!match) continue;
    const position = Number(match[1]);
    const entry = uploads.get(position) ?? { position, path: "", mime: "", size: 0, thumbPath: null, thumbMime: null };
    if (match[2]) {
      entry.thumbPath = folder + object.name;
      entry.thumbMime = EXTENSION_MIME[match[3]];
    } else {
      entry.path = folder + object.name;
      entry.mime = EXTENSION_MIME[match[3]];
      entry.size = Number((object.metadata as { size?: number } | null)?.size ?? 0);
    }
    uploads.set(position, entry);
  }
  return uploads;
}

export async function postAlbum(input: {
  orderNumber: string;
  role: ChatRole;
  userId: string;
  body: string;
  label: "proof_of_delivery" | null;
  attachments: AlbumAttachmentInput[];
  clientMessageId: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_post_album", {
    p_order_number: input.orderNumber,
    p_sender_role: input.role,
    p_sender: input.userId,
    p_body: input.body,
    p_label: input.label,
    p_attachments: input.attachments,
    p_client_message_id: input.clientMessageId,
  });
  if (error) throw toChatDataError(error);
  return data as { created: boolean; message: MessageRow };
}

/**
 * Chat files are write-once: an existing object is never replaced, so a
 * receipt or proof photo cannot be swapped after BudgetWise has seen it.
 * A retry of the same upload (same deterministic path) finds the object
 * already there and is treated as done — "created" vs "exists".
 */
export async function uploadAttachment(path: string, bytes: Uint8Array, mime: string): Promise<"created" | "exists"> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(ORDER_CHAT_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (!error) return "created";
  if (isStorageDuplicate(error)) return "exists";
  throw error;
}

function isStorageDuplicate(error: unknown) {
  const e = error as { statusCode?: string | number; status?: number; error?: string; message?: string } | null;
  return (
    String(e?.statusCode ?? e?.status ?? "") === "409" ||
    e?.error === "Duplicate" ||
    /already exists/i.test(e?.message ?? "")
  );
}

/** Whether this sender already posted a message with this client id. */
export async function messageExistsForClientId(orderNumber: string, userId: string, clientMessageId: string) {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("store_order_messages")
    .select("id", { count: "exact", head: true })
    .eq("order_number", orderNumber)
    .eq("sender_user_id", userId)
    .eq("client_message_id", clientMessageId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Deletes the sender's own not-yet-posted album uploads (Cancel / discard).
 * Never touches a folder whose album was posted.
 */
export async function deletePendingAlbumUploads(orderNumber: string, userId: string, clientMessageId: string) {
  if (await messageExistsForClientId(orderNumber, userId, clientMessageId)) return { deleted: 0, posted: true };
  const folder = albumFolderFor({ orderNumber, userId, clientMessageId });
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(ORDER_CHAT_BUCKET)
    .list(folder.replace(/\/$/, ""), { limit: 100 });
  if (error) throw error;
  const paths = (data ?? []).filter((object) => object.id).map((object) => folder + object.name);
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from(ORDER_CHAT_BUCKET).remove(paths);
    if (removeError) throw removeError;
  }
  return { deleted: paths.length, posted: false };
}

/**
 * Chat files no message references, uploaded more than `olderThanHours`
 * ago (abandoned albums: closed tab, cancelled, failed). The database
 * enforces a minimum age, so an upload still in progress is never listed.
 */
export async function listOrphanChatUploads(olderThanHours: number, limit: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_list_orphan_chat_uploads", {
    p_older_than_hours: olderThanHours,
    p_limit: limit,
  });
  if (error) throw toChatDataError(error);
  return data ?? [];
}

export async function removeChatUploads(paths: string[]) {
  if (paths.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(ORDER_CHAT_BUCKET).remove(paths);
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

/**
 * Opaque, stable avatar seed for a customer (0029): an HMAC of the account
 * id, so every conversation of the same customer shares one design and the
 * seed reveals nothing. Legacy orders without an account fall back to the
 * Roblox username, then the order number.
 */
function customerAvatarSeed(row: StoreAdminInboxRpcRow) {
  const subject = row.customer_user_id
    ? `user:${row.customer_user_id}`
    : row.buyer_roblox_username
      ? `roblox:${row.buyer_roblox_username.trim().toLowerCase()}`
      : `order:${row.order_number}`;
  const key = process.env.CUSTOMER_AVATAR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "budgetwise-avatar";
  return createHmac("sha256", key).update(subject).digest("hex").slice(0, 16);
}

export function toInboxRow(row: StoreAdminInboxRpcRow): InboxRow {
  return {
    // 0029: never the account id or raw Google metadata — an opaque seed and
    // a photo URL only if it is on Google's photo host.
    avatarSeed: customerAvatarSeed(row),
    avatarPhotoUrl: safeGooglePhotoUrl(row.customer_photo_url),
    gameIds: row.game_ids ?? [],
    gameNames: row.game_names ?? [],
    conversationId: row.conversation_id,
    orderNumber: row.order_number,
    // General Inquiry rows (0026) have no order fields.
    buyerName: row.buyer_name ?? "Customer",
    buyerRobloxUsername: row.buyer_roblox_username ?? "",
    totalAmount: row.total_amount === null ? 0 : Number(row.total_amount),
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
    state: row.state ?? "active",
    doneAt: row.done_at ?? null,
    doneBy: row.done_by ?? null,
    paymentRequestMessageId: row.payment_request_message_id ?? null,
    paymentReceivedMessageId: row.payment_received_message_id ?? null,
    paymentReceivedAt: row.payment_received_at ?? null,
    paymentReceivedBy: row.payment_received_by ?? null,
    lastCustomerMessageAt: row.last_customer_message_at ?? null,
    lastCustomerMessageId: row.last_customer_message_id ?? null,
    lastAdminReplyAt: row.last_admin_reply_at ?? null,
    lastAdminReplyId: row.last_admin_reply_id ?? null,
    lastAdminReplyBy: row.last_admin_reply_by ?? null,
    viewedBy: row.viewed_by ?? [],
  };
}

const INBOX_FILTER_SET = new Set<InboxFilter>(INBOX_FILTERS);

/** Unknown or missing filters mean the Active working queue. */
export function parseInboxFilter(value: unknown): InboxFilter {
  return typeof value === "string" && INBOX_FILTER_SET.has(value as InboxFilter)
    ? (value as InboxFilter)
    : "active";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function loadInboxPage(
  adminId: string,
  {
    filter = "active",
    search = "",
    before = null,
    games = null,
    includeInquiries = true,
  }: {
    filter?: InboxFilter;
    search?: string;
    before?: InboxCursor | null;
    /** 0029: null = All games; otherwise orders containing any of these game ids. */
    games?: string[] | null;
    includeInquiries?: boolean;
  } = {},
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
    // Only sent when a game filter is on (All games is the default).
    ...(games ? { p_games: games, p_include_inquiries: includeInquiries } : {}),
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

/** 0029: Active chats needing a reply that the game filter hides. */
export async function loadOutsideNeedsReply(adminId: string, games: string[] | null, includeInquiries: boolean) {
  if (!games) return 0;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_admin_inbox_outside_count", {
    p_admin: adminId,
    p_games: games,
    p_include_inquiries: includeInquiries,
  });
  if (error) throw toChatDataError(error);
  return Number(data ?? 0);
}

// ----------------------------------------------- inbox game filter (0029)

export interface InboxGameOption {
  id: string;
  name: string;
}

export interface InboxPreferences {
  /** null = All games. */
  games: string[] | null;
  includeInquiries: boolean;
}

export const DEFAULT_INBOX_PREFERENCES: InboxPreferences = { games: null, includeInquiries: true };

/** Every game in the catalog (hidden ones too: old orders still name them). */
export async function listInboxGames(): Promise<InboxGameOption[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("games").select("id, name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((game) => ({ id: game.id, name: game.name }));
}

/** This admin's saved filter; defaults (and the pre-0029 schema) mean All games. */
export async function loadInboxPreferences(adminId: string): Promise<InboxPreferences> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_admin_inbox_preferences")
    .select("*")
    .eq("admin_user_id", adminId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return DEFAULT_INBOX_PREFERENCES;
    throw error;
  }
  return data ? { games: data.game_ids, includeInquiries: data.include_inquiries } : DEFAULT_INBOX_PREFERENCES;
}

/** Saves the caller's own filter (the admin id comes from the session). */
export async function saveInboxPreferences(adminId: string, preferences: InboxPreferences) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("store_admin_inbox_preferences").upsert({
    admin_user_id: adminId,
    game_ids: preferences.games,
    include_inquiries: preferences.includeInquiries,
    updated_at: new Date().toISOString(),
  });
  if (error) throw toChatDataError(error);
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

/** Mark Done / Reopen. The database re-checks the admin and the race. */
export async function setConversationState(input: {
  orderNumber: string;
  actorId: string;
  state: ConversationState;
  lastSeenMessageId: string | null;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_set_conversation_state", {
    p_order_number: input.orderNumber,
    p_actor: input.actorId,
    p_state: input.state,
    p_last_seen_message_id: input.lastSeenMessageId,
  });
  if (error) throw toChatDataError(error);
  return data;
}

export interface AdminDirectoryEntry {
  userId: string;
  displayName: string;
  /** Public username (Twicks / Zuno / Akio), 0025; null when not set. */
  publicUsername: string | null;
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
    // select *: public_username (0025) reads as missing on older databases.
    .select("*")
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
        publicUsername: (row as { public_username?: string | null }).public_username?.trim() || null,
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
      "line_index, gamepass_id, game_id, game_name, product_name, quantity, robux_amount, unit_price, line_total, is_via_plus",
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

/**
 * The catalog's own product artwork for the frozen gamepass ids on an order
 * (never generated or modified). Decorative: a failure means no images.
 */
export async function loadLineArtwork(lines: Array<{ gamepass_id?: string | null }>) {
  const ids = [...new Set(lines.map((line) => line.gamepass_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, string>();
  // identity: null skips the slower Roblox universe-name fallback: override
  // and icon-cache artwork only, in one parallel round trip.
  return getProductArtworkUrlMap(await getProductArtworkMapSafe(ids, { identity: null }));
}

/**
 * Admin details panel for a General Inquiry: the customer (name, email) and
 * the conversation's workflow state, in the order-details shape with no items,
 * total or payment — so assignment and Done/Reopen work unchanged.
 */
async function loadInquiryDetails(key: string): Promise<OrderDetails | null> {
  const inquiry = await getChatInquiry(key);
  if (!inquiry) return null;
  const supabase = createAdminClient();
  const [conversation, owner] = await Promise.all([
    getConversation(key),
    supabase.auth.admin.getUserById(inquiry.ownerUserId),
  ]);
  const email = owner?.data?.user?.email ?? null;
  return {
    kind: "inquiry",
    order: {
      orderNumber: key,
      createdAt: inquiry.createdAt,
      status: "inquiry",
      total: 0,
      conversationId: conversation?.id ?? null,
      assignedAdminId: conversation?.assigned_admin_id ?? null,
      paymentDetailsSentAt: null,
      state: conversation?.state ?? "active",
      doneAt: conversation?.done_at ?? null,
    },
    customer: { name: inquiry.customerName ?? email ?? "Customer", robloxUsername: "", email },
    viaPlus: null,
    groups: [],
    fulfillmentPending: 0,
  };
}

/** Admin Order Details panel. Built from order records only — never chat. */
export async function loadOrderDetails(orderNumber: string): Promise<OrderDetails | null> {
  if (isInquiryKey(orderNumber)) return loadInquiryDetails(orderNumber);
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
  const artwork = await loadLineArtwork(lines);

  return buildOrderDetails({
    snapshot,
    lines,
    viaPlus,
    fulfillmentRows,
    status,
    conversation,
    customerEmail: owner?.data?.user?.email ?? null,
    artwork,
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

/**
 * Payment details in a General Inquiry (0031): the amount is the admin's
 * explicit quote (no order exists to take a total from). The database
 * checks the admin, the inquiry, the amount and idempotency, and assigns an
 * Unassigned inquiry to the sender.
 */
export async function sendInquiryPaymentDetails(input: {
  key: string;
  actorId: string;
  methodId: string;
  amount: number;
  clientMessageId: string;
}): Promise<MessageRow> {
  const supabase = createAdminClient();
  const { data: messageId, error } = await supabase.rpc("store_send_inquiry_payment_details", {
    p_key: input.key,
    p_actor: input.actorId,
    p_method_id: input.methodId,
    p_amount: input.amount,
    p_client_message_id: input.clientMessageId,
  });
  if (error) throw toChatDataError(error);
  const message = await getMessageInOrder(input.key, messageId as string);
  if (!message) throw new ChatDataError("Not found.", 404);
  return message;
}

/**
 * "Payment Received" for one payment card (0027). The database checks the
 * admin, that the card belongs to this order and is its latest one, and
 * serializes concurrent confirmations; a repeat returns the first one.
 * BudgetWise-internal only: XOB orders.status is never touched.
 */
export async function confirmPaymentReceived(input: {
  orderNumber: string;
  messageId: string;
  actorId: string;
}): Promise<{ created: boolean; confirmation: StorePaymentConfirmationRow }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_confirm_payment", {
    p_order_number: input.orderNumber,
    p_message_id: input.messageId,
    p_actor: input.actorId,
  });
  if (error) throw toChatDataError(error);
  return data as { created: boolean; confirmation: StorePaymentConfirmationRow };
}

// ------------------------------------------------------------------ customer

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

/** One row per conversation the customer has: drives the floating button. */
export interface CustomerConversationSummary {
  conversationId: string;
  orderNumber: string;
  state: ConversationState;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderRole: ChatRole | null;
}

export async function listCustomerConversations(userId: string): Promise<CustomerConversationSummary[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_customer_conversations", { p_user: userId });
  if (error) throw toChatDataError(error);
  return (data ?? []).map((row) => ({
    conversationId: row.conversation_id,
    orderNumber: row.order_number,
    state: row.state ?? "active",
    unreadCount: row.unread_count,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastSenderRole: row.last_sender_role,
  }));
}

/** A My Orders card. */
export interface CustomerOrderCard {
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  robloxUsername: string;
  /** XOB's order status (read-only). */
  status: string;
  /** BudgetWise's workflow state: In progress / Completed. */
  state: ConversationState;
  doneAt: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderRole: ChatRole | null;
  paymentSent: boolean;
  summary: string;
  thumbnails: string[];
}

export interface CustomerOrderCursor {
  at: string;
  orderNumber: string;
}

export const COMPLETED_PAGE_SIZE = 20;

/**
 * My Orders, one section at a time: "open" (everything in progress, at most
 * 100, newest activity first) or "completed" (keyset pages of 20, most
 * recently completed first). Item summaries and thumbnails come from the
 * frozen order lines for just the orders on the page.
 */
export async function loadCustomerOrderSection(
  userId: string,
  section: "open" | "completed",
  cursor: CustomerOrderCursor | null = null,
): Promise<{ rows: CustomerOrderCard[]; nextCursor: CustomerOrderCursor | null }> {
  const supabase = createAdminClient();
  const limit = section === "completed" ? COMPLETED_PAGE_SIZE + 1 : 100;
  const { data, error } = await supabase.rpc("store_customer_orders", {
    p_user: userId,
    p_section: section,
    p_before_at: cursor?.at ?? null,
    p_before_order: cursor?.orderNumber ?? null,
    p_limit: limit,
  });
  if (error) throw toChatDataError(error);
  const all = data ?? [];
  const page = section === "completed" ? all.slice(0, COMPLETED_PAGE_SIZE) : all;
  const orderNumbers = page.map((row) => row.order_number);

  const loadLines = async () => {
    if (orderNumbers.length === 0) return [];
    const { data: lineRows, error: lineError } = await supabase
      .from("store_order_line_snapshots")
      .select("order_number, line_index, gamepass_id, game_name, product_name, quantity, robux_amount, unit_price, line_total")
      .in("order_number", orderNumbers);
    if (lineError) throw lineError;
    return lineRows ?? [];
  };
  const [statuses, allLines] = await Promise.all([loadOrderStatuses(orderNumbers), loadLines()]);
  const linesByOrder = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const list = linesByOrder.get(line.order_number) ?? [];
    list.push(line);
    linesByOrder.set(line.order_number, list);
  }
  const artwork = await loadLineArtwork(allLines);

  const rows = page.map((row): CustomerOrderCard => {
    const lines = summarizeLines(linesByOrder.get(row.order_number) ?? [], artwork);
    return {
      orderNumber: row.order_number,
      totalAmount: Number(row.total_amount),
      createdAt: row.created_at,
      robloxUsername: row.buyer_roblox_username,
      status: statuses.get(row.order_number) ?? "pending",
      state: row.state ?? "active",
      doneAt: row.done_at,
      unreadCount: row.unread_count,
      lastMessageAt: row.last_message_at,
      lastMessagePreview: row.last_message_preview,
      lastSenderRole: row.last_sender_role,
      paymentSent: Boolean(row.payment_details_sent_at),
      summary: describeOrderItems(lines),
      thumbnails: [...new Set(lines.map((line) => line.imageUrl).filter((url): url is string => Boolean(url)))].slice(0, 3),
    };
  });

  const last = page[page.length - 1];
  return {
    rows,
    nextCursor:
      section === "completed" && all.length > COMPLETED_PAGE_SIZE && last?.done_at
        ? { at: last.done_at, orderNumber: last.order_number }
        : null,
  };
}

/** Structured summary pinned above the customer's conversation. */
export interface CustomerOrderSummary {
  /** "inquiry": the customer's General Inquiry (no items, total or payment). */
  kind: "order" | "inquiry";
  orderNumber: string;
  conversationId: string | null;
  totalAmount: number;
  createdAt: string;
  buyerName: string;
  robloxUsername: string;
  status: string;
  state: ConversationState;
  paymentSent: boolean;
  /** 0027: the most recently confirmed payment card (the client re-syncs that message). */
  paymentReceivedMessageId: string | null;
  itemCount: number;
  summary: string;
  lines: SummaryLine[];
}

export async function loadCustomerOrderSummary(orderNumber: string): Promise<CustomerOrderSummary | null> {
  if (isInquiryKey(orderNumber)) {
    const [inquiry, conversation] = await Promise.all([getChatInquiry(orderNumber), getConversation(orderNumber)]);
    if (!inquiry) return null;
    return {
      kind: "inquiry",
      orderNumber,
      conversationId: conversation?.id ?? null,
      totalAmount: 0,
      createdAt: inquiry.createdAt,
      buyerName: inquiry.customerName ?? "",
      robloxUsername: "",
      status: "",
      state: conversation?.state ?? "active",
      // 0031: an inquiry can carry a quoted payment card too.
      paymentSent: Boolean(conversation?.payment_details_sent_at),
      paymentReceivedMessageId: conversation?.payment_received_message_id ?? null,
      itemCount: 0,
      summary: "General Inquiry",
      lines: [],
    };
  }
  const [order, lines, conversation, status] = await Promise.all([
    getChatOrder(orderNumber),
    loadOrderLines(orderNumber),
    getConversation(orderNumber),
    loadOrderStatus(orderNumber),
  ]);
  if (!order) return null;
  const summarized = summarizeLines(lines, await loadLineArtwork(lines));
  return {
    kind: "order",
    orderNumber: order.orderNumber,
    conversationId: conversation?.id ?? null,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    buyerName: order.buyerName,
    robloxUsername: order.buyerRobloxUsername,
    status: status ?? "pending",
    state: conversation?.state ?? "active",
    paymentSent: Boolean(conversation?.payment_details_sent_at),
    paymentReceivedMessageId: conversation?.payment_received_message_id ?? null,
    itemCount: summarized.reduce((sum, line) => sum + line.quantity, 0),
    summary: describeOrderItems(summarized),
    lines: summarized,
  };
}

/** How many orders this account has placed (first-order guidance). */
export async function countCustomerOrders(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("store_order_snapshots")
    .select("order_number", { count: "exact", head: true })
    .eq("owner_user_id", userId);
  if (error) throw error;
  return count ?? 0;
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
