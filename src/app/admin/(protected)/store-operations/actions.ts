"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  GameAvailabilityStatus,
  ProductAvailabilityStatus,
  StoreStatus,
} from "@/types/store-operations";

const STORE_STATUSES: StoreStatus[] = ["open", "maintenance", "closed"];
const GAME_STATUSES: GameAvailabilityStatus[] = [
  "available",
  "temporarily_unavailable",
  "coming_soon",
  "hidden",
];
const PRODUCT_STATUSES: ProductAvailabilityStatus[] = [
  "available",
  "out_of_stock",
  "coming_soon",
  "hidden",
];

export interface ActionResult {
  success: boolean;
  error?: string;
}

// Every action re-runs requireAdmin() itself — a Server Action is an
// independently callable HTTP endpoint regardless of which page's form
// triggered it, so the (protected) layout's guard alone isn't sufficient.

export async function updateStoreStatusAction(
  status: string,
  noticeMessage: string,
): Promise<ActionResult> {
  await requireAdmin();

  if (!STORE_STATUSES.includes(status as StoreStatus)) {
    return { success: false, error: "Invalid store status." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({
      store_status: status as StoreStatus,
      notice_message: noticeMessage.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function scheduleStoreChangeAction(input: {
  scheduledStatus: string | null;
  scheduledAt: string | null;
  scheduledReopenAt: string | null;
}): Promise<ActionResult> {
  await requireAdmin();

  if (
    input.scheduledStatus &&
    !STORE_STATUSES.includes(input.scheduledStatus as StoreStatus)
  ) {
    return { success: false, error: "Invalid scheduled status." };
  }

  // A schedule needs both a target status and a time, or neither.
  if (!!input.scheduledStatus !== !!input.scheduledAt) {
    return {
      success: false,
      error: "Pick both a status and a time for the scheduled change.",
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({
      scheduled_status: (input.scheduledStatus as StoreStatus) || null,
      scheduled_at: input.scheduledAt || null,
      scheduled_reopen_at: input.scheduledReopenAt || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateGameAvailabilityAction(
  gameId: string,
  status: string,
): Promise<ActionResult> {
  await requireAdmin();

  if (!GAME_STATUSES.includes(status as GameAvailabilityStatus)) {
    return { success: false, error: "Invalid game availability status." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("games")
    .update({ availability_status: status as GameAvailabilityStatus })
    .eq("id", gameId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateProductAvailabilityAction(
  gamepassId: string,
  status: string,
): Promise<ActionResult> {
  await requireAdmin();

  if (!PRODUCT_STATUSES.includes(status as ProductAvailabilityStatus)) {
    return { success: false, error: "Invalid product availability status." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("gamepasses")
    .update({ availability_status: status as ProductAvailabilityStatus })
    .eq("id", gamepassId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
