import "server-only";
import { NextResponse } from "next/server";
import type { ChatSenderRole } from "@/types/order-chat";

export function chatError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Which side of the conversation the caller says they are acting as. */
export function parseActingAs(request: Request): ChatSenderRole {
  return new URL(request.url).searchParams.get("as") === "admin"
    ? "admin"
    : "customer";
}

/**
 * Cookie-authenticated writes must come from this site. Browsers always send
 * Origin on cross-site POSTs; when it is present and does not match the host
 * we are served from, refuse before touching anything.
 */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
