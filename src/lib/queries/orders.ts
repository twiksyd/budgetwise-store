import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOrderNumber } from "@/lib/orders";
import { resolveStoreStatus } from "@/lib/store-status";
import { STORE_STATUS_DEFAULT_MESSAGES } from "@/types/store-operations";
import { isRobuxViaLinkSourceGame } from "@/config/robux-via-link";
import { isRobuxPlusGame, robuxPlusPresentation } from "@/config/robux-products";
import { getProductDisplayName } from "@/lib/product-display-name";
import {
  buildOrderConfirmationFromSnapshot,
  buildOrderSnapshotLines,
  sumSnapshotLineTotals,
} from "@/lib/order-snapshot.mjs";
import {
  authorizeOrderSlip,
  fingerprintOrderRequest,
  hashViewToken,
} from "@/lib/order-access.mjs";
import {
  OrderPersistenceError,
  persistStoreOrder,
  resolveReplayedOrder,
} from "@/lib/order-creation.mjs";
import type { StoreOrderRequest } from "@/lib/order-creation.mjs";
import type { CreateOrderInput } from "@/lib/validations/order";

export class OrderCreationError extends Error {
  constructor(
    message: string,
    public reason:
      | "store_unavailable"
      | "unavailable_items"
      | "invalid_order"
      | "idempotency_conflict",
    public unavailableGamepassIds: string[] = [],
  ) {
    super(message);
  }
}

// Orders created before migration 0019 have no snapshot row and therefore no
// viewing token, so their slips can only be looked up the old way: by order
// reference alone, rebuilt from current catalog data. That is the weaker,
// pre-Batch-2 behaviour, kept deliberately so links already in customers'
// hands (and orders still being processed) do not die the moment this ships.
// Flip to false to retire it once no legacy slip needs to be reachable; new
// orders are unaffected either way.
export const LEGACY_ORDER_SLIP_ACCESS_ENABLED = true;

// Order references reach this module straight from a URL segment. Anything
// that isn't shaped like one never becomes a database filter.
const ORDER_REFERENCE_RE = /^[A-Za-z0-9-]{1,40}$/;

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

function isMissingStoreMetadataTableError(
  error: { code?: string; message?: string },
  tableName: string,
) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes(tableName) === true
  );
}

async function findOrderByIdempotencyKey(
  supabase: SupabaseAdminClient,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from("store_order_snapshots")
    .select("order_number, request_fingerprint")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    orderNumber: data.order_number,
    requestFingerprint: data.request_fingerprint,
  };
}

// The one place a cart's contents actually get validated against live
// data — never trust quantities, prices, or availability the client
// already believes to be true. Every check here re-reads the database.
//
// What the customer submitted is then frozen into snapshot rows, so the
// resulting order slip never has to consult the catalog again (see
// getOrderConfirmation), and the whole logical order — every `orders` row,
// every line snapshot, the Via Plus metadata — is written by one
// transactional RPC keyed on the client's idempotency key.
export async function createOrder(
  input: CreateOrderInput,
): Promise<{ orderNumber: string; replayed: boolean }> {
  const supabase = createAdminClient();
  const requestFingerprint = fingerprintOrderRequest(input);

  // Answered before any freshness check on purpose: a retry of a checkout
  // that already succeeded must return that order even if the store has
  // since closed or an item has since sold out.
  const replayed = resolveReplayedOrder(
    await findOrderByIdempotencyKey(supabase, input.idempotencyKey),
    requestFingerprint,
  );
  if (replayed) return replayed;

  const { status, noticeMessage } = await resolveStoreStatus();
  if (status !== "open") {
    throw new OrderCreationError(
      noticeMessage?.trim() || STORE_STATUS_DEFAULT_MESSAGES[status],
      "store_unavailable",
    );
  }

  const gamepassIds = input.items.map((item) => item.gamepassId);

  const { data: gamepasses, error: fetchError } = await supabase
    .from("gamepasses")
    .select(
      "id, user_id, game_id, name, your_price, your_cost, robux_amount, is_active, availability_status",
    )
    .in("id", gamepassIds);

  if (fetchError) throw fetchError;

  const gamepassById = new Map((gamepasses ?? []).map((g) => [g.id, g]));

  const gameIds = [
    ...new Set((gamepasses ?? []).map((g) => g.game_id)),
  ];
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id, name, availability_status")
    .in("id", gameIds);

  if (gamesError) throw gamesError;

  const gameById = new Map((games ?? []).map((g) => [g.id, g]));

  const unavailable = input.items
    .filter((item) => {
      const gamepass = gamepassById.get(item.gamepassId);
      if (!gamepass) return true;
      if (!gamepass.is_active) return true;
      if (gamepass.availability_status !== "available") return true;
      const game = gameById.get(gamepass.game_id);
      if (!game) return true;
      const parentGameIsAcceptable =
        game.availability_status === "available" ||
        (game.availability_status === "hidden" &&
          isRobuxViaLinkSourceGame(gamepass.game_id));
      if (!parentGameIsAcceptable) return true;
      return false;
    })
    .map((item) => item.gamepassId);

  if (unavailable.length > 0) {
    throw new OrderCreationError(
      "One or more items in the cart are no longer available.",
      "unavailable_items",
      unavailable,
    );
  }

  const hasRobuxViaPlus = input.items.some((item) => {
    const gamepass = gamepassById.get(item.gamepassId);
    return gamepass ? isRobuxPlusGame(gamepass.game_id) : false;
  });
  const viaPlusRobuxAmount = input.items.reduce((sum, item) => {
    const gamepass = gamepassById.get(item.gamepassId);
    if (!gamepass || !isRobuxPlusGame(gamepass.game_id)) return sum;
    return sum + gamepass.robux_amount * item.quantity;
  }, 0);

  if (hasRobuxViaPlus && !input.viaPlus) {
    throw new OrderCreationError(
      "Complete the Via Plus requirements before creating this order.",
      "invalid_order",
    );
  }

  // The display name shown on the slip is captured now, at order time — a
  // later rename in the catalog must not rewrite what the customer ordered.
  const { data: displayNames, error: displayNameError } = await supabase
    .from("store_product_display_names")
    .select("gamepass_id, display_name")
    .in("gamepass_id", gamepassIds);

  if (
    displayNameError &&
    !isMissingStoreMetadataTableError(
      displayNameError,
      "store_product_display_names",
    )
  ) {
    throw displayNameError;
  }

  const displayNameByProductId = new Map(
    (displayNameError ? [] : (displayNames ?? [])).map((row) => [
      row.gamepass_id,
      row.display_name,
    ]),
  );

  const lines = buildOrderSnapshotLines(
    input.items.map((item) => {
      const gamepass = gamepassById.get(item.gamepassId)!;
      const isViaPlus = isRobuxPlusGame(gamepass.game_id);

      return {
        userId: gamepass.user_id,
        gamepassId: gamepass.id,
        gameId: gamepass.game_id,
        productName: getProductDisplayName({
          name: gamepass.name,
          display_name: displayNameByProductId.get(gamepass.id) ?? null,
        }),
        // The slip's Via Plus grouping (and the message formatter's Via Plus
        // detection) keys off this presentation name, so snapshot the name
        // the customer saw, not the raw catalog row.
        gameName: isViaPlus
          ? robuxPlusPresentation.displayName
          : (gameById.get(gamepass.game_id)?.name ?? "BudgetWise"),
        unitRobuxAmount: gamepass.robux_amount,
        unitPrice: gamepass.your_price,
        unitCost: gamepass.your_cost,
        quantity: item.quantity,
        isViaPlus,
      };
    }),
  );

  const request: StoreOrderRequest = {
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    viewTokenHash: hashViewToken(input.viewToken),
    buyerName: input.contact.name,
    buyerRobloxUsername: input.contact.robloxUsername,
    totalAmount: sumSnapshotLineTotals(lines),
    lines,
    viaPlus:
      hasRobuxViaPlus && input.viaPlus
        ? {
            roblox_display_name: input.viaPlus.robloxDisplayName,
            age_16_confirmed: input.viaPlus.age16Confirmed,
            verified_account_confirmed: input.viaPlus.verifiedAccountConfirmed,
            via_plus_robux_amount: viaPlusRobuxAmount,
          }
        : null,
  };

  try {
    return await persistStoreOrder({
      request,
      generateOrderNumber,
      createOrder: async (attempt) => {
        const { data, error } = await supabase.rpc("create_store_order", {
          p_idempotency_key: attempt.idempotencyKey,
          p_request_fingerprint: attempt.requestFingerprint,
          p_view_token_hash: attempt.viewTokenHash,
          p_order_number: attempt.orderNumber,
          p_buyer_name: attempt.buyerName,
          p_buyer_roblox_username: attempt.buyerRobloxUsername,
          p_total_amount: attempt.totalAmount,
          p_lines: attempt.lines,
          p_via_plus: attempt.viaPlus,
        });

        if (error) throw error;
        if (!data?.order_number) {
          throw new Error("create_store_order returned no order number");
        }

        return { orderNumber: data.order_number, replayed: data.replayed };
      },
    });
  } catch (error) {
    if (
      error instanceof OrderPersistenceError &&
      error.reason === "idempotency_conflict"
    ) {
      throw new OrderCreationError(error.message, "idempotency_conflict");
    }

    throw error;
  }
}

export interface OrderConfirmationLine {
  gamepassId: string;
  gameName: string;
  gamepassName: string;
  robuxAmount: number;
  sellingPrice: number;
  quantity: number;
}

export interface OrderConfirmation {
  orderNumber: string;
  buyerName: string;
  buyerRobloxUsername: string;
  viaPlusAccount: {
    robloxDisplayName: string;
    age16Confirmed: boolean;
    verifiedAccountConfirmed: boolean;
    viaPlusRobuxAmount: number;
  } | null;
  status: string;
  createdAt: string;
  total: number;
  lines: OrderConfirmationLine[];
}

async function getOrderViaPlusDetails(
  supabase: SupabaseAdminClient,
  orderNumber: string,
) {
  const { data, error } = await supabase
    .from("store_order_via_plus_details")
    .select(
      "roblox_display_name, age_16_confirmed, verified_account_confirmed, via_plus_robux_amount",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (
    error &&
    !isMissingStoreMetadataTableError(error, "store_order_via_plus_details")
  ) {
    throw error;
  }

  return error ? null : data;
}

/**
 * The customer-facing order slip.
 *
 * For orders created from migration 0019 onward this reads snapshot rows
 * only — no catalog lookup — so changing a product's price, name, Robux
 * amount, or availability afterwards cannot alter what the slip says the
 * customer ordered. Access requires the order's viewing token: the readable
 * BW number alone is not an authorisation secret.
 *
 * Returns only what the slip needs. Cost, profit, supplier, and internal
 * account data are never read here, and never leave the server.
 */
export async function getOrderConfirmation(
  orderNumber: string,
  viewToken?: string | null,
): Promise<OrderConfirmation | null> {
  if (!ORDER_REFERENCE_RE.test(orderNumber)) return null;

  const supabase = createAdminClient();

  const { data: header, error: headerError } = await supabase
    .from("store_order_snapshots")
    .select(
      "order_number, view_token_hash, buyer_name, buyer_roblox_username, total_amount, created_at",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (
    headerError &&
    !isMissingStoreMetadataTableError(headerError, "store_order_snapshots")
  ) {
    throw headerError;
  }

  if (!headerError && header) {
    if (
      !authorizeOrderSlip({
        orderReference: orderNumber,
        snapshot: header,
        viewToken,
      })
    ) {
      return null;
    }

    const { data: lines, error: linesError } = await supabase
      .from("store_order_line_snapshots")
      .select(
        "line_index, gamepass_id, game_id, product_name, game_name, robux_amount, quantity, unit_price, line_total, is_via_plus",
      )
      .eq("order_number", orderNumber)
      .order("line_index", { ascending: true });

    if (linesError) throw linesError;
    if (!lines || lines.length === 0) return null;

    const viaPlusDetails = await getOrderViaPlusDetails(supabase, orderNumber);

    // Fulfilment state is meant to move over time, so it is read live from
    // the order's own row rather than frozen with the contents.
    const { data: orderStatus, error: statusError } = await supabase
      .from("orders")
      .select("status")
      .eq("order_number", orderNumber)
      .limit(1)
      .maybeSingle();

    if (statusError) throw statusError;

    return buildOrderConfirmationFromSnapshot({
      header,
      lines,
      viaPlusDetails,
      status: orderStatus?.status ?? "pending",
    });
  }

  if (!LEGACY_ORDER_SLIP_ACCESS_ENABLED) return null;

  return getLegacyOrderConfirmation(supabase, orderNumber);
}

/**
 * Pre-0019 orders only.
 *
 * These have no snapshot, so the slip has to be rebuilt from current catalog
 * rows — which is exactly the behaviour migration 0019 exists to replace: a
 * later price change can distort the quantity this reconstructs. It stays
 * reachable so links already in customers' hands keep working, and applies
 * to no order created from 0019 onward.
 */
async function getLegacyOrderConfirmation(
  supabase: SupabaseAdminClient,
  orderNumber: string,
): Promise<OrderConfirmation | null> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "order_number, gamepass_id, buyer_name, buyer_roblox_username, robux_amount, selling_price, status, created_at",
    )
    .eq("order_number", orderNumber);

  if (error) throw error;
  if (!orders || orders.length === 0) return null;

  const gamepassIds = orders.map((o) => o.gamepass_id);
  const { data: gamepasses, error: gamepassError } = await supabase
    .from("gamepasses")
    .select("id, name, game_id, your_price, robux_amount")
    .in("id", gamepassIds);

  if (gamepassError) throw gamepassError;

  const gamepassById = new Map((gamepasses ?? []).map((g) => [g.id, g]));
  const { data: displayNames, error: displayNameError } = await supabase
    .from("store_product_display_names")
    .select("gamepass_id, display_name")
    .in("gamepass_id", gamepassIds);

  if (
    displayNameError &&
    !isMissingStoreMetadataTableError(
      displayNameError,
      "store_product_display_names",
    )
  ) {
    throw displayNameError;
  }

  const displayNameByProductId = new Map(
    (displayNameError ? [] : (displayNames ?? [])).map((row) => [
      row.gamepass_id,
      row.display_name,
    ]),
  );
  const gameIds = [...new Set((gamepasses ?? []).map((g) => g.game_id))];

  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id, name")
    .in("id", gameIds);

  if (gamesError) throw gamesError;

  const viaPlusDetails = await getOrderViaPlusDetails(supabase, orderNumber);

  const gameNameById = new Map((games ?? []).map((g) => [g.id, g.name]));

  return {
    orderNumber,
    buyerName: orders[0].buyer_name,
    buyerRobloxUsername: orders[0].buyer_roblox_username,
    viaPlusAccount: viaPlusDetails
      ? {
          robloxDisplayName: viaPlusDetails.roblox_display_name,
          age16Confirmed: viaPlusDetails.age_16_confirmed,
          verifiedAccountConfirmed: viaPlusDetails.verified_account_confirmed,
          viaPlusRobuxAmount: viaPlusDetails.via_plus_robux_amount,
        }
      : null,
    status: orders[0].status,
    createdAt: orders[0].created_at,
    total: orders.reduce((sum, o) => sum + o.selling_price, 0),
    lines: orders.map((o) => {
      const gamepass = gamepassById.get(o.gamepass_id);
      const quantityFromPrice =
        gamepass?.your_price && gamepass.your_price > 0
          ? o.selling_price / gamepass.your_price
          : 0;
      const quantityFromRobux =
        gamepass?.robux_amount && gamepass.robux_amount > 0
          ? o.robux_amount / gamepass.robux_amount
          : 0;
      const quantity = Number.isInteger(quantityFromPrice) && quantityFromPrice > 0
        ? quantityFromPrice
        : Number.isInteger(quantityFromRobux) && quantityFromRobux > 0
          ? quantityFromRobux
          : 1;

      return {
        gamepassId: o.gamepass_id,
        gameName:
          gamepass && isRobuxPlusGame(gamepass.game_id)
            ? robuxPlusPresentation.displayName
            : gameNameById.get(gamepass?.game_id ?? "") ?? "BudgetWise",
        gamepassName: gamepass
          ? getProductDisplayName({
              name: gamepass.name,
              display_name: displayNameByProductId.get(gamepass.id) ?? null,
            })
          : "Gamepass",
        robuxAmount: o.robux_amount,
        sellingPrice: o.selling_price,
        quantity,
      };
    }),
  };
}
