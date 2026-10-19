"use client";

import { useEffect } from "react";
import { detectTrafficSource } from "@/lib/order-handoff.mjs";

const KEY = "bw:traffic-source";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remembers (for 30 days, in this browser only) that the customer arrived
 * from TikTok, so checkout can report it. Whether that changes anything is
 * decided on the server from siteConfig.orderHandoff.
 */
export function TrafficSourceCapture() {
  useEffect(() => {
    const source = detectTrafficSource({
      search: window.location.search,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
    });
    if (!source) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ source, at: Date.now() }));
    } catch {
      // Storage blocked: the order simply uses the default channel.
    }
  }, []);
  return null;
}

/** The remembered source, if still fresh. */
export function readTrafficSource(): string | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { source?: string; at?: number } | null;
    if (!value?.source || Date.now() - Number(value.at) > TTL_MS) return null;
    return value.source;
  } catch {
    return null;
  }
}
