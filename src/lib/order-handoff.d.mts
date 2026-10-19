export type TrafficSource = "tiktok";
export type OrderChannel = "messenger" | "site";
export declare const TRAFFIC_SOURCES: readonly ["tiktok"];
export function detectTrafficSource(input?: { search?: string; referrer?: string; userAgent?: string }): TrafficSource | null;
export function parseTrafficSource(value: unknown): TrafficSource | null;
export function chooseOrderChannel(
  source: unknown,
  config: { channel: OrderChannel; siteChatSources: readonly string[] } | null | undefined,
): OrderChannel;
export function orderMessengerLink(pageId: string | null | undefined, orderNumber?: string | null): string | null;
