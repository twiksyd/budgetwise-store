"use server";

import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "product-artwork";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 7000;
const MAX_REMOTE_REDIRECTS = 3;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface ProductArtworkActionResult {
  success: boolean;
  error?: string;
  warning?: string;
}

class RemoteImageError extends Error {}

function validateGamepassId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  return UUID_RE.test(value) ? value : null;
}

function normalizeContentType(value: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? null;
}

function isValidImageBuffer(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }

  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  return false;
}

function parseRemoteImageUrl(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== "string") return null;
  const raw = rawValue.trim();
  if (!raw || raw.length > 2048) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  );
}

function isBlockedIpAddress(address: string) {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 ||
      a >= 224
    );
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
}

async function assertSafeRemoteUrl(url: URL) {
  if (url.protocol !== "https:") {
    throw new RemoteImageError("Only HTTPS image URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new RemoteImageError("Image URLs cannot include credentials.");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new RemoteImageError("Local image URLs are not allowed.");
  }

  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0) {
    throw new RemoteImageError("Could not verify the image host.");
  }

  if (addresses.some((entry) => isBlockedIpAddress(entry.address))) {
    throw new RemoteImageError("Private or local image hosts are not allowed.");
  }
}

async function fetchWithTimeout(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    return await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new RemoteImageError("Image download timed out.");
    }
    throw new RemoteImageError("Could not download the image.");
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedResponse(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_UPLOAD_BYTES) {
    throw new RemoteImageError("Image must be 4 MB or smaller.");
  }

  if (!response.body) {
    throw new RemoteImageError("Image response was empty.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;

    if (total > MAX_UPLOAD_BYTES) {
      throw new RemoteImageError("Image must be 4 MB or smaller.");
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks, total);
}

async function fetchRemoteImage(originalUrl: URL) {
  let currentUrl = originalUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
    await assertSafeRemoteUrl(currentUrl);
    const response = await fetchWithTimeout(currentUrl);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new RemoteImageError("Image redirect did not include a destination.");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new RemoteImageError("Image host did not return a valid image.");
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));
    if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
      throw new RemoteImageError("Image must be PNG, JPG, JPEG, or WebP.");
    }

    const buffer = await readLimitedResponse(response);
    if (!isValidImageBuffer(buffer, contentType)) {
      throw new RemoteImageError("Downloaded file is not a valid image.");
    }

    return {
      buffer,
      contentType,
      finalUrl: currentUrl.toString(),
      size: buffer.byteLength,
    };
  }

  throw new RemoteImageError("Image URL redirected too many times.");
}

function revalidateArtworkPages() {
  revalidatePath("/admin/product-assets");
  revalidatePath("/games", "layout");
}

async function removeStoragePath(storagePath: string | null | undefined) {
  if (!storagePath) return null;

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  return error?.message ?? null;
}

// Snapshotted onto every override so a future upstream re-import (XOB
// replacing gamepasses rows with new ids — see migration 0011) leaves
// something to name-match an orphaned override against, instead of an
// unrecoverable dangling UUID.
async function lookupGamepassSnapshot(gamepassId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("gamepasses")
    .select("name, game_id")
    .eq("id", gamepassId)
    .maybeSingle();
  return { productName: data?.name ?? null, gameId: data?.game_id ?? null };
}

async function applyArtworkChange(input: {
  gamepassId: string;
  action:
    | "manual_upload"
    | "manual_url"
    | "restore_roblox"
    | "restore_placeholder";
  source?: "manual" | "placeholder" | null;
  manualKind?: "upload" | "remote" | null;
  iconUrl?: string | null;
  storagePath?: string | null;
  contentType?: string | null;
  fileSizeBytes?: number | null;
  adminUserId: string;
  adminEmail: string | null;
  details?: Record<string, unknown>;
  productName?: string | null;
  gameId?: string | null;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("apply_product_artwork_override", {
    p_gamepass_id: input.gamepassId,
    p_action: input.action,
    p_source: input.source ?? null,
    p_manual_kind: input.manualKind ?? null,
    p_icon_url: input.iconUrl ?? null,
    p_storage_path: input.storagePath ?? null,
    p_content_type: input.contentType ?? null,
    p_file_size_bytes: input.fileSizeBytes ?? null,
    p_admin_user_id: input.adminUserId,
    p_admin_email: input.adminEmail,
    p_details: input.details ?? {},
    p_product_name: input.productName ?? null,
    p_game_id: input.gameId ?? null,
  });

  if (error) throw error;

  return data?.[0] ?? {
    previous_source: null,
    previous_icon_url: null,
    previous_storage_path: null,
  };
}

async function saveManualArtwork(input: {
  gamepassId: string;
  action: "manual_upload" | "manual_url";
  manualKind: "upload" | "remote";
  buffer: Buffer;
  contentType: string;
  adminUserId: string;
  adminEmail: string | null;
  details?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const extension = EXTENSION_BY_TYPE[input.contentType];
  const storagePath = `${input.gamepassId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.buffer, {
      contentType: input.contentType,
      upsert: false,
    });

  if (uploadError) return { success: false, error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { productName, gameId } = await lookupGamepassSnapshot(input.gamepassId);

  let previousStoragePath: string | null = null;

  try {
    const previous = await applyArtworkChange({
      gamepassId: input.gamepassId,
      action: input.action,
      source: "manual",
      manualKind: input.manualKind,
      iconUrl: publicUrl,
      storagePath,
      contentType: input.contentType,
      fileSizeBytes: input.buffer.byteLength,
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail,
      details: input.details,
      productName,
      gameId,
    });
    previousStoragePath = previous.previous_storage_path;
  } catch (error) {
    const cleanupError = await removeStoragePath(storagePath);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Artwork was not saved to the database.",
      warning: cleanupError
        ? `The new upload could not be cleaned up: ${cleanupError}`
        : undefined,
    };
  }

  const cleanupError = await removeStoragePath(previousStoragePath);

  revalidateArtworkPages();
  return {
    success: true,
    warning: cleanupError
      ? `Artwork saved, but the old image could not be cleaned up: ${cleanupError}`
      : undefined,
  };
}

export async function uploadProductArtworkAction(
  formData: FormData,
): Promise<ProductArtworkActionResult> {
  const admin = await requireAdmin();
  const gamepassId = validateGamepassId(formData.get("gamepassId"));
  const file = formData.get("file");

  if (!gamepassId) return { success: false, error: "Invalid product." };
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Choose an image to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { success: false, error: "Image must be 4 MB or smaller." };
  }

  const contentType = normalizeContentType(file.type);
  if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
    return { success: false, error: "Use PNG, JPG, JPEG, or WebP only." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isValidImageBuffer(buffer, contentType)) {
    return { success: false, error: "The uploaded file is not a valid image." };
  }

  return saveManualArtwork({
    gamepassId,
    action: "manual_upload",
    manualKind: "upload",
    buffer,
    contentType,
    adminUserId: admin.id,
    adminEmail: admin.email,
    details: { contentType, fileSizeBytes: file.size },
  });
}

export async function saveProductArtworkUrlAction(
  formData: FormData,
): Promise<ProductArtworkActionResult> {
  const admin = await requireAdmin();
  const gamepassId = validateGamepassId(formData.get("gamepassId"));
  const originalUrl = parseRemoteImageUrl(formData.get("iconUrl"));

  if (!gamepassId) return { success: false, error: "Invalid product." };
  if (!originalUrl) {
    return { success: false, error: "Use a valid HTTPS image URL." };
  }

  try {
    const image = await fetchRemoteImage(originalUrl);
    return saveManualArtwork({
      gamepassId,
      action: "manual_url",
      manualKind: "remote",
      buffer: image.buffer,
      contentType: image.contentType,
      adminUserId: admin.id,
      adminEmail: admin.email,
      details: {
        originalUrl: originalUrl.toString(),
        finalUrl: image.finalUrl,
        contentType: image.contentType,
        fileSizeBytes: image.size,
      },
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof RemoteImageError
          ? error.message
          : "The remote image could not be validated.",
    };
  }
}

export async function restoreRobloxArtworkAction(
  gamepassId: string,
): Promise<ProductArtworkActionResult> {
  const admin = await requireAdmin();
  if (!UUID_RE.test(gamepassId)) {
    return { success: false, error: "Invalid product." };
  }

  try {
    const previous = await applyArtworkChange({
      gamepassId,
      action: "restore_roblox",
      adminUserId: admin.id,
      adminEmail: admin.email,
    });
    const cleanupError = await removeStoragePath(previous.previous_storage_path);

    revalidateArtworkPages();
    return {
      success: true,
      warning: cleanupError
        ? `Roblox artwork restored, but the old image could not be cleaned up: ${cleanupError}`
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not restore Roblox artwork.",
    };
  }
}

export async function restorePlaceholderArtworkAction(
  gamepassId: string,
): Promise<ProductArtworkActionResult> {
  const admin = await requireAdmin();
  if (!UUID_RE.test(gamepassId)) {
    return { success: false, error: "Invalid product." };
  }

  try {
    const { productName, gameId } = await lookupGamepassSnapshot(gamepassId);
    const previous = await applyArtworkChange({
      gamepassId,
      action: "restore_placeholder",
      source: "placeholder",
      adminUserId: admin.id,
      adminEmail: admin.email,
      productName,
      gameId,
    });
    const cleanupError = await removeStoragePath(previous.previous_storage_path);

    revalidateArtworkPages();
    return {
      success: true,
      warning: cleanupError
        ? `Placeholder restored, but the old image could not be cleaned up: ${cleanupError}`
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not restore placeholder.",
    };
  }
}

async function getCurrentCardBackgroundStoragePath(gamepassId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_product_card_backgrounds")
    .select("storage_path")
    .eq("gamepass_id", gamepassId)
    .maybeSingle();

  if (error) throw error;
  return data?.storage_path ?? null;
}

export async function uploadProductCardBackgroundAction(
  formData: FormData,
): Promise<ProductArtworkActionResult> {
  const admin = await requireAdmin();
  const gamepassId = validateGamepassId(formData.get("gamepassId"));
  const file = formData.get("file");

  if (!gamepassId) return { success: false, error: "Invalid product." };
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Choose a background image to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { success: false, error: "Image must be 4 MB or smaller." };
  }

  const contentType = normalizeContentType(file.type);
  if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
    return { success: false, error: "Use PNG, JPG, JPEG, or WebP only." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isValidImageBuffer(buffer, contentType)) {
    return { success: false, error: "The uploaded file is not a valid image." };
  }

  const supabase = createAdminClient();
  const extension = EXTENSION_BY_TYPE[contentType];
  const storagePath = `${gamepassId}/backgrounds/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) return { success: false, error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { productName, gameId } = await lookupGamepassSnapshot(gamepassId);
  let previousStoragePath: string | null = null;

  try {
    previousStoragePath = await getCurrentCardBackgroundStoragePath(gamepassId);
    const { error } = await supabase
      .from("store_product_card_backgrounds")
      .upsert(
        {
          gamepass_id: gamepassId,
          image_url: publicUrl,
          storage_path: storagePath,
          content_type: contentType,
          file_size_bytes: buffer.byteLength,
          product_name: productName,
          game_id: gameId,
          updated_by: admin.id,
        },
        { onConflict: "gamepass_id" },
      );

    if (error) throw error;
  } catch (error) {
    const cleanupError = await removeStoragePath(storagePath);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Background was not saved to the database.",
      warning: cleanupError
        ? `The new background could not be cleaned up: ${cleanupError}`
        : undefined,
    };
  }

  const cleanupError = await removeStoragePath(previousStoragePath);

  revalidateArtworkPages();
  return {
    success: true,
    warning: cleanupError
      ? `Background saved, but the old image could not be cleaned up: ${cleanupError}`
      : undefined,
  };
}

export async function removeProductCardBackgroundAction(
  gamepassId: string,
): Promise<ProductArtworkActionResult> {
  await requireAdmin();

  if (!UUID_RE.test(gamepassId)) {
    return { success: false, error: "Invalid product." };
  }

  const supabase = createAdminClient();

  try {
    const previousStoragePath = await getCurrentCardBackgroundStoragePath(gamepassId);
    const { error } = await supabase
      .from("store_product_card_backgrounds")
      .delete()
      .eq("gamepass_id", gamepassId);

    if (error) throw error;

    const cleanupError = await removeStoragePath(previousStoragePath);

    revalidateArtworkPages();
    return {
      success: true,
      warning: cleanupError
        ? `Background removed, but the old image could not be cleaned up: ${cleanupError}`
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not remove the background.",
    };
  }
}

// Re-points an orphaned override (its gamepass_id no longer exists in
// gamepasses, typically because XOB re-imported and minted a new id for the
// same product) at the replacement row, without re-uploading the image.
// See migration 0011 and src/lib/queries/artwork-reconciliation.ts.
export async function relinkProductArtworkOverrideAction(
  oldGamepassId: string,
  newGamepassId: string,
): Promise<ProductArtworkActionResult> {
  const admin = await requireAdmin();
  if (!UUID_RE.test(oldGamepassId) || !UUID_RE.test(newGamepassId)) {
    return { success: false, error: "Invalid product." };
  }

  const supabase = createAdminClient();
  const { productName, gameId } = await lookupGamepassSnapshot(newGamepassId);
  if (!productName) {
    return { success: false, error: "Target product not found." };
  }

  const { error } = await supabase.rpc("relink_product_artwork_override", {
    p_old_gamepass_id: oldGamepassId,
    p_new_gamepass_id: newGamepassId,
    p_product_name: productName,
    p_game_id: gameId,
    p_admin_user_id: admin.id,
    p_admin_email: admin.email,
  });

  if (error) return { success: false, error: error.message };

  revalidateArtworkPages();
  revalidatePath("/admin/artwork-recovery");
  return { success: true };
}
