// Admin inbox clarity (0028). Four separate facts per conversation — never
// mixed together:
//
//   Unread (by me)  customer messages after MY OWN read cursor. Another
//                   admin reading or replying never changes it.
//   Needs reply     the latest customer message (text, photo, album or the
//                   order slip) has no admin reply after it, and the chat is
//                   Active.
//   Replied by      the admin who sent the latest admin reply. A reply is
//                   an admin's text, photo or album (proof of delivery
//                   counts). A payment-details card is NOT a reply: it is a
//                   generated card, not an answer to the customer.
//   Viewed by       admins whose own read cursor reached the latest
//                   customer message. Viewing never counts as replying.
//
// The database derives the same facts (migration 0028); these functions
// apply the rule to live realtime events so every admin's list updates
// without refetching.
import { comparePositions } from "./cursor.mjs";

export const REPLY_KINDS = Object.freeze(["text", "image", "album"]);

/** Does this message answer the customer? (admin text / photo / album) */
export function isAdminReply(message) {
  return message?.sender_role === "admin" && REPLY_KINDS.includes(message.kind);
}

const position = (at, id) => ({ createdAt: at, id });

export function needsReply(row) {
  if (!row || (row.state ?? "active") !== "active" || !row.lastCustomerMessageId) return false;
  if (!row.lastAdminReplyId) return true;
  return comparePositions(
    position(row.lastAdminReplyAt, row.lastAdminReplyId),
    position(row.lastCustomerMessageAt, row.lastCustomerMessageId),
  ) < 0;
}

/** "Replied by X" applies while no customer message came after the reply. */
export function repliedBy(row) {
  if (!row?.lastAdminReplyId || !row.lastAdminReplyBy) return null;
  if (row.lastCustomerMessageId && needsReply({ ...row, state: "active" })) return null;
  return row.lastAdminReplyBy;
}

/** Other admins who read the latest customer activity (never me). */
export function viewedByOthers(row, me) {
  return (row?.viewedBy ?? []).filter((id) => id !== me);
}

/**
 * New order / first inquiry message that nobody has handled yet: needs a
 * reply, no admin has ever replied, and no admin has read it.
 */
export function isNewAttention(row) {
  return needsReply(row) && !row.lastAdminReplyId && (row.viewedBy ?? []).length === 0;
}

/**
 * Visual priority of a row:
 *   high    needs a reply and nobody has looked yet, or I have unread in it
 *   medium  needs a reply but another admin has viewed it; or replied while
 *           I still have unread
 *   low     replied and read by me; Done
 */
export function attentionLevel(row, me) {
  if (!row || (row.state ?? "active") !== "active") return "low";
  const unread = row.unreadCount > 0;
  if (needsReply(row)) return unread || viewedByOthers(row, me).length === 0 ? "high" : "medium";
  return unread ? "medium" : "low";
}

/** A live 'message' event applied to the row's reply state. */
export function applyMessageToReplyState(row, message) {
  if (!message?.id || !message.created_at) return row;
  const at = position(message.created_at, message.id);
  if (message.sender_role === "customer") {
    if (row.lastCustomerMessageId && comparePositions(at, position(row.lastCustomerMessageAt, row.lastCustomerMessageId)) <= 0) return row;
    // New customer activity: nobody has viewed THIS yet.
    return { ...row, lastCustomerMessageAt: message.created_at, lastCustomerMessageId: message.id, viewedBy: [] };
  }
  if (isAdminReply(message)) {
    if (row.lastAdminReplyId && comparePositions(at, position(row.lastAdminReplyAt, row.lastAdminReplyId)) <= 0) return row;
    return {
      ...row,
      lastAdminReplyAt: message.created_at,
      lastAdminReplyId: message.id,
      lastAdminReplyBy: message.sender_user_id ?? null,
    };
  }
  return row;
}

/** Some admin's read cursor moved: are they now a viewer of the latest activity? */
export function applyReadToViewedBy(row, adminId, at, messageId) {
  if (!row?.lastCustomerMessageId || !adminId || !at || !messageId) return row;
  const viewed = row.viewedBy ?? [];
  if (viewed.includes(adminId)) return row;
  const covers = comparePositions(position(at, messageId), position(row.lastCustomerMessageAt, row.lastCustomerMessageId)) >= 0;
  return covers ? { ...row, viewedBy: [...viewed, adminId] } : row;
}
