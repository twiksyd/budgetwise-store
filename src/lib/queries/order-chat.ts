import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  MESSAGE_RATE_LIMIT,
  buildAttachmentPath,
  isUuid,
  isValidOrderNumber,
} from "@/lib/order-chat.mjs";
import type {
  ChatMessageKind,
  ChatSenderRole,
} from "@/types/order-chat";

export const ORDER_CHAT_BUCKET = "order-chat-attachments";
// Hard ceiling on what one page load reads. Real threads are a few dozen
// messages; this only exists so a runaway thread cannot make a page huge.
const MAX_MESSAGES_PER_THREAD = 500;

export interface ChatOrderHeader {
  orderNumber: string;
  ownerUserId: string | null;
  buyerName: string;
  buyerRobloxUsername: string;
  totalAmount: number;
  createdAt: string;
}

export interface ChatActor {
  role: ChatSenderRole;
  userId: string;
  order: ChatOrderHeader;
}

export type ChatActorFailure = {
  ok: false;
  status: 401 | 403 | 404;
  error: string;
};

export type ChatActorResult = ({ ok: true } & ChatActor) | ChatActorFailure;

export const CHAT_MESSAGE_COLUMNS =
  "id, order_number, sender_role, kind, body, attachment_path, created_at, read_at";

export async function getChatOrderHeader(
  orderNumber: string,
): Promise<ChatOrderHeader | null> {
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

async function isAdminUser(userId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

/**
 * The single gate every chat endpoint goes through.
 *
 * `as` says which side of the conversation the caller is acting as. It is a
 * request, never a grant: "customer" requires the signed-in user to own the
 * order, "admin" requires them to be in admin_users. A wrong order number, an
 * order someone else owns, and an order that does not exist all answer 404,
 * so nothing is learned by guessing BW numbers.
 */
export async function resolveChatActor(
  orderNumber: string,
  as: ChatSenderRole,
): Promise<ChatActorResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: "Please sign in first." };

  if (as === "admin" && !(await isAdminUser(user.id))) {
    return { ok: false, status: 403, error: "Not allowed." };
  }

  const order = await getChatOrderHeader(orderNumber);
  if (!order) return { ok: false, status: 404, error: "Order not found." };

  if (as === "customer" && order.ownerUserId !== user.id) {
    return { ok: false, status: 404, error: "Order not found." };
  }

  return { ok: true, role: as, userId: user.id, order };
}

export async function listChatMessages(
  orderNumber: string,
  { after }: { after?: string | null } = {},
) {
  const supabase = createAdminClient();
  let query = supabase
    .from("store_order_messages")
    .select(CHAT_MESSAGE_COLUMNS)
    .eq("order_number", orderNumber)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES_PER_THREAD);

  if (after) query = query.gt("created_at", after);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** True when this sender has already posted too many messages just now. */
export async function isOverMessageRateLimit(
  orderNumber: string,
  role: ChatSenderRole,
) {
  const since = new Date(
    Date.now() - MESSAGE_RATE_LIMIT.windowSeconds * 1000,
  ).toISOString();

  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("store_order_messages")
    .select("id", { count: "exact", head: true })
    .eq("order_number", orderNumber)
    .eq("sender_role", role)
    .gte("created_at", since);

  if (error) throw error;
  return (count ?? 0) >= MESSAGE_RATE_LIMIT.count;
}

export async function insertTextMessage(actor: ChatActor, body: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_messages")
    .insert({
      order_number: actor.order.orderNumber,
      sender_role: actor.role,
      sender_user_id: actor.userId,
      kind: "text",
      body,
    })
    .select(CHAT_MESSAGE_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function insertImageMessage(
  actor: ChatActor,
  {
    body,
    bytes,
    mime,
    extension,
  }: { body: string; bytes: Uint8Array; mime: string; extension: string },
) {
  const supabase = createAdminClient();
  const messageId = crypto.randomUUID();
  const path = buildAttachmentPath({
    orderNumber: actor.order.orderNumber,
    messageId,
    extension,
  });

  const { error: uploadError } = await supabase.storage
    .from(ORDER_CHAT_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("store_order_messages")
    .insert({
      id: messageId,
      order_number: actor.order.orderNumber,
      sender_role: actor.role,
      sender_user_id: actor.userId,
      kind: "image",
      body,
      attachment_path: path,
      attachment_mime: mime,
    })
    .select(CHAT_MESSAGE_COLUMNS)
    .single();

  if (error) {
    // Don't leave an orphaned file behind when the row didn't land.
    await supabase.storage.from(ORDER_CHAT_BUCKET).remove([path]);
    throw error;
  }

  return data;
}

/** Marks the *other* party's messages as read now that `role` has seen them. */
export async function markChatRead(orderNumber: string, role: ChatSenderRole) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("store_order_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("order_number", orderNumber)
    .eq("sender_role", role === "customer" ? "admin" : "customer")
    .is("read_at", null);

  if (error) throw error;
}

/**
 * Ties a freshly created order to the signed-in account and posts the order
 * slip as the first message. Safe to run again for a replayed checkout: the
 * owner is only ever set while empty, and the slip is unique per order.
 *
 * Returns false when the order already belongs to a different account (a
 * replayed idempotency key from someone else), which the caller treats as a
 * conflict rather than handing that order over.
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

  const header = await getChatOrderHeader(orderNumber);
  if (!header || header.ownerUserId !== userId) return false;

  const { error: slipError } = await supabase
    .from("store_order_messages")
    .insert({
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

export async function getMessageForAttachment(messageId: string) {
  if (!isUuid(messageId)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_order_messages")
    .select("id, order_number, attachment_path, attachment_mime")
    .eq("id", messageId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.attachment_path) return null;
  return data;
}

export async function createAttachmentSignedUrl(path: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(ORDER_CHAT_BUCKET)
    .createSignedUrl(path, 60);

  if (error) throw error;
  return data.signedUrl;
}

export interface CustomerOrderListItem {
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessageKind: ChatMessageKind | null;
  lastMessageBody: string | null;
  lastSenderRole: ChatSenderRole | null;
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
    if (!statusByOrder.has(row.order_number)) {
      statusByOrder.set(row.order_number, row.status);
    }
  }
  return statusByOrder;
}

export async function listCustomerOrders(
  userId: string,
): Promise<CustomerOrderListItem[]> {
  const supabase = createAdminClient();
  const { data: orders, error } = await supabase
    .from("store_order_snapshots")
    .select("order_number, total_amount, created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  if (!orders || orders.length === 0) return [];

  const orderNumbers = orders.map((order) => order.order_number);
  const [{ data: summaries, error: summaryError }, statusByOrder] =
    await Promise.all([
      supabase.rpc("store_order_chat_summaries", {
        p_order_numbers: orderNumbers,
      }),
      loadOrderStatuses(orderNumbers),
    ]);

  if (summaryError) throw summaryError;

  const summaryByOrder = new Map(
    (summaries ?? []).map((summary) => [summary.order_number, summary]),
  );

  return orders.map((order) => {
    const summary = summaryByOrder.get(order.order_number);
    return {
      orderNumber: order.order_number,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
      status: statusByOrder.get(order.order_number) ?? "pending",
      unreadCount: summary?.unread_for_customer ?? 0,
      lastMessageAt: summary?.last_message_at ?? null,
      lastMessageKind: summary?.last_message_kind ?? null,
      lastMessageBody: summary?.last_message_body ?? null,
      lastSenderRole: summary?.last_sender_role ?? null,
    };
  });
}

export interface AdminInboxItem {
  orderNumber: string;
  buyerName: string;
  buyerRobloxUsername: string;
  totalAmount: number;
  createdAt: string;
  status: string;
  lastMessageAt: string;
  lastMessageKind: ChatMessageKind;
  lastMessageBody: string;
  lastSenderRole: ChatSenderRole;
  unreadCount: number;
}

// Callers must have passed requireAdmin() first.
export async function listAdminInbox(limit = 100): Promise<AdminInboxItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("store_admin_chat_inbox", {
    p_limit: limit,
  });

  if (error) throw error;
  const rows = data ?? [];
  const statusByOrder = await loadOrderStatuses(
    rows.map((row) => row.order_number),
  );

  return rows.map((row) => ({
    orderNumber: row.order_number,
    buyerName: row.buyer_name,
    buyerRobloxUsername: row.buyer_roblox_username,
    totalAmount: Number(row.total_amount),
    createdAt: row.created_at,
    status: statusByOrder.get(row.order_number) ?? "pending",
    lastMessageAt: row.last_message_at,
    lastMessageKind: row.last_message_kind,
    lastMessageBody: row.last_message_body,
    lastSenderRole: row.last_sender_role,
    unreadCount: row.unread_for_admin,
  }));
}

export async function getOrderStatus(orderNumber: string) {
  const statuses = await loadOrderStatuses([orderNumber]);
  return statuses.get(orderNumber) ?? "pending";
}
