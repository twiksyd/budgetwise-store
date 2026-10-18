// Admin inbox state. Realtime events PATCH single rows and reorder; nothing
// here ever triggers a full inbox refetch. A row the client does not know
// (brand-new chat) or cannot recompute exactly (another tab's read) is put
// in `stale`, and only that one row is fetched.
import { comparePositions, toMicros } from "./cursor.mjs";
import { applyMessageToReplyState, applyReadToViewedBy, attentionState, needsReply } from "./inbox-attention.mjs";

// "active" is the working queue (default). unread / unassigned / mine are
// views of the Active queue; "done" is the archive; "all" is everything.
export const INBOX_FILTERS = Object.freeze(["active", "needs_reply", "unopened", "seen_no_reply", "unread", "mine", "unassigned", "done", "all", "under_review"]);
const ACTIVE_QUEUE_FILTERS = new Set(["active", "needs_reply", "unopened", "seen_no_reply", "unread", "unassigned", "mine"]);

/** Done conversations never sit in the Active queue, even while open. */
function excludedByState(row, filter) {
  const state = row.state ?? "active";
  if (ACTIVE_QUEUE_FILTERS.has(filter)) return state !== "active";
  if (filter === "done") return state !== "done";
  return false;
}

export function createInboxState({ me, rows = [], hasMore = false, nextCursor = null, view }) {
  const state = {
    me,
    rows: {},
    order: [],
    hasMore,
    nextCursor,
    stale: [],
    view: { filter: "active", search: "", games: null, includeInquiries: true, ...view },
  };
  for (const row of rows) state.rows[row.orderNumber] = row;
  state.order = sortOrder(state.rows, Object.keys(state.rows));
  return state;
}

function sortOrder(rows, keys) {
  return [...keys].sort((a, b) => {
    const ra = rows[a];
    const rb = rows[b];
    const ta = toMicros(ra.lastMessageAt);
    const tb = toMicros(rb.lastMessageAt);
    if (ta !== tb) return tb - ta;
    return a < b ? 1 : a > b ? -1 : 0;
  });
}

/**
 * Personal game filter (0029): null games = All games. Orders match when
 * they contain ANY chosen game (mixed-game orders included); General
 * Inquiry chats match when includeInquiries is on.
 */
export function matchesGames(row, view) {
  if (!Array.isArray(view?.games)) return true;
  if (row.orderNumber.startsWith("GI-")) return view.includeInquiries !== false;
  const chosen = new Set(view.games);
  return (row.gameIds ?? []).some((id) => chosen.has(id));
}

export function matchesView(row, view, me, activeOrderNumber) {
  if (excludedByState(row, view.filter)) return false;
  if (row.orderNumber === activeOrderNumber) return true; // never yank the open chat
  if (!matchesGames(row, view)) return false;
  const search = (view.search ?? "").trim().toLowerCase();
  if (
    search &&
    !row.orderNumber.toLowerCase().includes(search) &&
    !row.buyerName.toLowerCase().includes(search) &&
    !row.buyerRobloxUsername.toLowerCase().includes(search)
  ) {
    return false;
  }
  switch (view.filter) {
    case "needs_reply":
      return needsReply(row);
    case "unopened":
      return attentionState(row) === "unopened";
    case "seen_no_reply":
      return attentionState(row) === "seen";
    case "unread":
      return row.unreadCount > 0;
    case "unassigned":
      return !row.assignedAdminId;
    case "mine":
      return row.assignedAdminId === me;
    case "under_review":
      return row.orderStatus === "pending";
    default:
      return true;
  }
}

function withRow(state, row, activeOrderNumber) {
  const rows = { ...state.rows };
  let keys = state.order.filter((key) => key !== row.orderNumber);
  if (matchesView(row, state.view, state.me, activeOrderNumber)) {
    rows[row.orderNumber] = row;
    keys = sortOrder(rows, [...keys, row.orderNumber]);
  } else {
    delete rows[row.orderNumber];
  }
  return {
    ...state,
    rows,
    order: keys,
    stale: state.stale.filter((key) => key !== row.orderNumber),
  };
}

function markStale(state, orderNumber) {
  return state.stale.includes(orderNumber)
    ? state
    : { ...state, stale: [...state.stale, orderNumber] };
}

/**
 * Actions:
 *   reset          { rows, hasMore, nextCursor, view }
 *   append         { rows, hasMore, nextCursor }
 *   upsert_row     { row, activeOrderNumber }
 *   message_event  { event, activeOrderNumber, activeIsRead }
 *   conversation_event { event, activeOrderNumber }
 *   read_event     { event }
 *   mark_read      { orderNumber, at, messageId }
 */
export function inboxReducer(state, action) {
  switch (action.type) {
    case "reset":
      return createInboxState({
        me: state.me,
        rows: action.rows,
        hasMore: action.hasMore,
        nextCursor: action.nextCursor,
        view: action.view ?? state.view,
      });

    case "append": {
      const rows = { ...state.rows };
      for (const row of action.rows) rows[row.orderNumber] = row;
      return {
        ...state,
        rows,
        order: sortOrder(rows, Object.keys(rows)),
        hasMore: action.hasMore,
        nextCursor: action.nextCursor,
      };
    }

    case "upsert_row":
      return withRow(state, action.row, action.activeOrderNumber);

    case "message_event": {
      const { event } = action;
      const orderNumber = event?.order_number;
      if (!orderNumber) return state;
      const row = state.rows[orderNumber];
      if (!row || event.is_new_conversation) return markStale(state, orderNumber);

      // Same event twice (reconnect, two tabs) must not double-count.
      if (row.lastMessageId === event.message.id) return state;
      const isNewer =
        comparePositions(
          { createdAt: event.message.created_at, id: event.message.id },
          { createdAt: row.lastMessageAt, id: row.lastMessageId },
        ) > 0;

      const countsAsUnread =
        event.message.sender_role === "customer" &&
        !(orderNumber === action.activeOrderNumber && action.activeIsRead);

      const next = applyMessageToReplyState({
        ...row,
        ...(isNewer
          ? {
              lastMessageId: event.row.last_message_id,
              lastMessageAt: event.row.last_message_at,
              lastMessageKind: event.row.last_message_kind,
              lastMessagePreview: event.row.last_message_preview,
              lastSenderRole: event.row.last_sender_role,
            }
          : {}),
        state: event.row.state ?? row.state,
        paymentDetailsSentAt: event.row.payment_details_sent_at ?? row.paymentDetailsSentAt,
        // A newer payment card is the one awaiting confirmation (0027); the
        // conversation event that follows says the same.
        ...(isNewer && event.message.kind === "payment" ? { paymentRequestMessageId: event.message.id } : {}),
        unreadCount: countsAsUnread ? row.unreadCount + 1 : row.unreadCount,
      }, event.message);
      // 0033: a new order joined this customer conversation — re-read the
      // row for its order count, latest order, total and games.
      if (event.message.kind === "slip") return markStale(withRow(state, next, action.activeOrderNumber), orderNumber);
      return withRow(state, next, action.activeOrderNumber);
    }

    case "conversation_event": {
      const { event } = action;
      const row = state.rows[event?.order_number];
      if (!row) return state;
      return withRow(
        state,
        {
          ...row,
          assignedAdminId: event.assigned_admin_id ?? null,
          assignedAt: event.assigned_at ?? null,
          customerReadAt: event.customer_read_at ?? null,
          customerReadMessageId: event.customer_read_message_id ?? null,
          // 0027 (events from before it carry no payment fields).
          ...("payment_received_message_id" in event
            ? {
                paymentRequestMessageId: event.payment_request_message_id ?? null,
                paymentReceivedMessageId: event.payment_received_message_id ?? null,
                paymentReceivedAt: event.payment_received_at ?? null,
                paymentReceivedBy: event.payment_received_by ?? null,
              }
            : {}),
          ...(event.state ? { state: event.state, doneAt: event.done_at ?? null, doneBy: event.done_by ?? null } : {}),
        },
        action.activeOrderNumber,
      );
    }

    case "read_event": {
      const { event } = action;
      const row = state.rows[event?.order_number];
      if (!row) return state;
      // Another admin's read never touches my counts; it only says they
      // viewed the latest customer activity ("Viewed by", 0028).
      if (event.admin_user_id !== state.me) {
        const viewed = applyReadToViewedBy(row, event.admin_user_id, event.last_read_at, event.last_read_message_id);
        // Re-filtered (0030): it may leave Unopened or enter Seen, no reply.
        return viewed === row ? state : withRow(state, viewed, action.activeOrderNumber);
      }
      const coversLast =
        comparePositions(
          { createdAt: event.last_read_at, id: event.last_read_message_id },
          { createdAt: row.lastMessageAt, id: row.lastMessageId },
        ) >= 0;
      const next = {
        ...applyReadToViewedBy(row, state.me, event.last_read_at, event.last_read_message_id),
        myReadAt: event.last_read_at,
        myReadMessageId: event.last_read_message_id,
        unreadCount: coversLast ? 0 : row.unreadCount,
      };
      const updated = withRow(state, next, undefined);
      return coversLast ? updated : markStale(updated, event.order_number);
    }

    case "mark_read": {
      const row = state.rows[action.orderNumber];
      if (!row) return state;
      // Reported again for the same message: nothing changes, no re-render.
      if (row.unreadCount === 0 && row.myReadMessageId === action.messageId) return state;
      return {
        ...state,
        rows: {
          ...state.rows,
          [action.orderNumber]: {
            ...applyReadToViewedBy(row, state.me, action.at, action.messageId),
            unreadCount: 0,
            myReadAt: action.at,
            myReadMessageId: action.messageId,
          },
        },
      };
    }

    default:
      return state;
  }
}

/**
 * "Paid" (0027): an admin confirmed the order's LATEST payment card. Newer
 * payment details after a confirmation read as unpaid again; a receipt
 * from the customer never counts.
 */
export function isPaymentReceived(row) {
  return Boolean(
    row?.paymentReceivedMessageId && row.paymentReceivedMessageId === row.paymentRequestMessageId,
  );
}

export function visibleRows(state) {
  return state.order.map((key) => state.rows[key]);
}
