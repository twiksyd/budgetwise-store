import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOrderNumber } from "@/lib/orders";
import { resolveStoreStatus } from "@/lib/store-status";
import { STORE_STATUS_DEFAULT_MESSAGES } from "@/types/store-operations";
import { isRobuxViaLinkSourceGame } from "@/config/robux-via-link";
import { isRobuxPlusGame, robuxPlusPresentation } from "@/config/robux-products";
import { getProductDisplayName } from "@/lib/product-display-name";
import type { CreateOrderInput } from "@/lib/validations/order";

export class OrderCreationError extends Error {
  constructor(
    message: string,
    public reason: "store_unavailable" | "unavailable_items",
    public unavailableGamepassIds: string[] = [],
  ) {
    super(message);
  }
}

// The one place a cart's contents actually get validated against live
// data — never trust quantities, prices, or availability the client
// already believes to be true. Every check here re-reads the database.
export async function createOrder(
  input: CreateOrderInput,
): Promise<{ orderNumber: string }> {
  const { status, noticeMessage } = await resolveStoreStatus();
  if (status !== "open") {
    throw new OrderCreationError(
      noticeMessage?.trim() || STORE_STATUS_DEFAULT_MESSAGES[status],
      "store_unavailable",
    );
  }

  const supabase = createAdminClient();
  const gamepassIds = input.items.map((item) => item.gamepassId);

  const { data: gamepasses, error: fetchError } = await supabase
    .from("gamepasses")
    .select(
      "id, user_id, game_id, your_price, your_cost, robux_amount, is_active, availability_status",
    )
    .in("id", gamepassIds);

  if (fetchError) throw fetchError;

  const gamepassById = new Map((gamepasses ?? []).map((g) => [g.id, g]));

  const gameIds = [
    ...new Set((gamepasses ?? []).map((g) => g.game_id)),
  ];
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select("id, availability_status")
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

  const orderNumber = generateOrderNumber();

  const rows = input.items.map((item) => {
    const gamepass = gamepassById.get(item.gamepassId)!;
    const sellingPrice = gamepass.your_price * item.quantity;
    const cost = gamepass.your_cost * item.quantity;

    return {
      user_id: gamepass.user_id,
      order_number: orderNumber,
      gamepass_id: gamepass.id,
      buyer_name: input.contact.name,
      buyer_roblox_username: input.contact.robloxUsername,
      robux_amount: gamepass.robux_amount * item.quantity,
      selling_price: sellingPrice,
      cost,
      profit: sellingPrice - cost,
      status: "pending",
    };
  });

  const { error: insertError } = await supabase.from("orders").insert(rows);
  if (insertError) throw insertError;

  return { orderNumber };
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
  status: string;
  createdAt: string;
  total: number;
  lines: OrderConfirmationLine[];
}

function isMissingDisplayNameTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("store_product_display_names") === true
  );
}

export async function getOrderConfirmation(
  orderNumber: string,
): Promise<OrderConfirmation | null> {
  const supabase = createAdminClient();

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

  if (displayNameError && !isMissingDisplayNameTableError(displayNameError)) {
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

  const gameNameById = new Map((games ?? []).map((g) => [g.id, g.name]));

  return {
    orderNumber,
    buyerName: orders[0].buyer_name,
    buyerRobloxUsername: orders[0].buyer_roblox_username,
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
