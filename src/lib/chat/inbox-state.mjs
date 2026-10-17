// Admin inbox state. Realtime events PATCH single rows and reorder; nothing
// here ever triggers a full inbox refetch. A row the client does not know
// (brand-new chat) or cannot recompute exactly (another tab's read) is put
// in `stale`, and only that one row is fetched.
import { comparePositions, toMicros } from "./cursor.mjs";

// "active" is the working queue (default). unread / unassigned / mine are
// views of the Active queue; "done" is the archive; "all" is everything.
export const INBOX_FILTERS = Object.freeze(["active", "unread", "mine", "unassigned", "done", "all", "under_review"]);
const ACTIVE_QUEUE_FILTERS = new Set(["active", "unread", "unassigned", "mine"]);

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
    view: { filter: "active", search: "", ...view },
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

export function matchesView(row, view, me, activeOrderNumber) {
  if (excludedByState(row, view.filter)) return false;
  if (row.orderNumber === activeOrderNumber) return true; // never yank the open chat
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

      const next = {
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
        unreadCount: countsAsUnread ? row.unreadCount + 1 : row.unreadCount,
      };
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
          ...(event.state ? { state: event.state, doneAt: event.done_at ?? null, doneBy: event.done_by ?? null } : {}),
        },
        action.activeOrderNumber,
      );
    }

    case "read_event": {
      const { event } = action;
      if (event?.admin_user_id !== state.me) return state; // other admins' reads never touch my counts
      const row = state.rows[event.order_number];
      if (!row) return state;
      const coversLast =
        comparePositions(
          { createdAt: event.last_read_at, id: event.last_read_message_id },
          { createdAt: row.lastMessageAt, id: row.lastMessageId },
        ) >= 0;
      const next = {
        ...row,
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
            ...row,
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

export function visibleRows(state) {
  return state.order.map((key) => state.rows[key]);
}
