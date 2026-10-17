import "server-only";
import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/chat/origin.mjs";
import { ChatDataError, getSessionUserId, isAdminUser } from "@/lib/queries/order-chat";
import type { ChatRole } from "@/lib/queries/order-chat";

const NO_STORE = { "Cache-Control": "no-store" };

export function chatJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function chatError(error: string, status: number) {
  return chatJson({ error }, status);
}

/** Which side of the conversation the caller says they are acting as. */
export function parseActingAs(request: Request): ChatRole {
  return new URL(request.url).searchParams.get("as") === "admin" ? "admin" : "customer";
}

/**
 * Cookie-authenticated writes must come from this site. Browsers always send
 * Origin on cross-site POSTs; when it is present it must match the host the
 * browser actually addressed (Host / X-Forwarded-Host — request.url can carry
 * an internal hostname behind proxies or in `next dev`).
 */
export function isSameOriginRequest(request: Request) {
  return isSameOrigin({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    requestUrl: request.url,
  });
}

/** Small JSON bodies only; accepts text/plain too (navigator.sendBeacon). */
export async function readSmallJson(request: Request, maxBytes = 8 * 1024): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Uniform handling of data-layer errors in route handlers. */
export function routeErrorResponse(error: unknown, context: string) {
  if (error instanceof ChatDataError) return chatError(error.message, error.status);
  console.error(`${context} failed`, error instanceof Error ? error.message : error);
  return chatError("Something went wrong. Please try again.", 500);
}

/** Sends a route-core result ({status, body} or {status: 302, location}). */
export function sendCoreResult(result: { status: number; body?: unknown; location?: string }) {
  if (result.status === 302 && result.location) {
    return NextResponse.redirect(result.location, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return chatJson(result.body ?? {}, result.status);
}

/**
 * Admin API gate: the admin id comes from the verified session and
 * admin_users, never from the request.
 */
export async function requireAdminApi(
  request: Request,
  { mutating }: { mutating: boolean },
): Promise<{ ok: true; adminId: string } | { ok: false; response: NextResponse }> {
  if (mutating && !isSameOriginRequest(request)) {
    return { ok: false, response: chatError("Not allowed.", 403) };
  }
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, response: chatError("Please sign in.", 401) };
  if (!(await isAdminUser(userId))) return { ok: false, response: chatError("Not allowed.", 403) };
  return { ok: true, adminId: userId };
}
