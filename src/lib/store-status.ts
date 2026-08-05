import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreSettingsUpdate } from "@/types/database-admin";
import type { StoreStatus } from "@/types/store-operations";

export interface ResolvedStoreStatus {
  status: StoreStatus;
  noticeMessage: string | null;
}

export interface StoreSettings {
  status: StoreStatus;
  noticeMessage: string | null;
  scheduledStatus: StoreStatus | null;
  scheduledAt: string | null;
  scheduledReopenAt: string | null;
}

// Admin-facing: the raw row, so the Store Operations form can show exactly
// what's configured (including a pending schedule) rather than only the
// resolved current status. Also applies any schedule that's already due,
// same as resolveStoreStatus, so the form never shows a stale status.
export async function getStoreSettingsForAdmin(): Promise<StoreSettings> {
  await resolveStoreStatus();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (error) throw error;

  return {
    status: data.store_status,
    noticeMessage: data.notice_message,
    scheduledStatus: data.scheduled_status,
    scheduledAt: data.scheduled_at,
    scheduledReopenAt: data.scheduled_reopen_at,
  };
}

// There's no external cron here — scheduled open/close times are applied
// lazily, the moment any request actually asks for the current status
// (the checkout API, or a storefront page render). For a site that only
// ever changes state in response to real traffic, this is equivalent to a
// cron firing "whenever the next visitor shows up" — simpler than wiring
// up a separate scheduled function, and it can't silently drift out of
// sync with what the database actually contains. The tradeoff: on a
// completely traffic-free site, a scheduled change won't visibly "apply"
// until the next request arrives to observe it.
export async function resolveStoreStatus(): Promise<ResolvedStoreStatus> {
  const supabase = createAdminClient();

  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (error) throw error;

  const now = new Date();
  let { store_status: status } = settings;
  const updates: StoreSettingsUpdate = {};

  if (
    settings.scheduled_status &&
    settings.scheduled_at &&
    new Date(settings.scheduled_at) <= now
  ) {
    status = settings.scheduled_status;
    updates.store_status = status;
    updates.scheduled_status = null;
    updates.scheduled_at = null;
  }

  if (
    settings.scheduled_reopen_at &&
    new Date(settings.scheduled_reopen_at) <= now
  ) {
    status = "open";
    updates.store_status = status;
    updates.scheduled_reopen_at = null;
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = now.toISOString();
    const { error: updateError } = await supabase
      .from("store_settings")
      .update(updates)
      .eq("id", true);
    if (updateError) throw updateError;
  }

  return { status, noticeMessage: settings.notice_message };
}

// For the storefront layout only — never for checkout enforcement. A
// transient failure to read store_settings (or the migration not having
// been applied yet) must not take the entire site down; it just means no
// banner renders and ordering isn't gated by store status until the read
// succeeds again. createOrder() calls resolveStoreStatus() directly (not
// this) specifically so it keeps failing closed: if that read fails, order
// creation fails too, rather than silently letting orders through.
export async function resolveStoreStatusSafe(): Promise<ResolvedStoreStatus> {
  try {
    return await resolveStoreStatus();
  } catch (error) {
    console.error("Failed to resolve store status", error);
    return { status: "open", noticeMessage: null };
  }
}
