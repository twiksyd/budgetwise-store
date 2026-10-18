import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SignalEvent } from "@/lib/chat/signals.mjs";

export const ADMIN_INBOX_TOPIC = "admin:inbox";

/**
 * Publishes a typing/viewing signal to the private admin topic with the
 * service role (browsers have no permission to publish there). The event's
 * admin_user_id was taken from the verified session by the caller.
 */
export async function publishAdminSignal(event: SignalEvent) {
  const supabase = createAdminClient();
  const channel = supabase.channel(ADMIN_INBOX_TOPIC, { config: { private: true } });
  try {
    const result = await channel.httpSend("signal", event, { timeout: 5000 });
    if (!result.success) {
      console.warn("Admin signal not delivered", result.status, result.error);
    }
  } finally {
    await supabase.removeChannel(channel);
  }
}

/**
 * 0032: a server-published broadcast on any private topic (typing pings to a
 * customer's chat:<conversation id>, customer typing to admin:inbox). The
 * caller has already authorised the sender from the session; payloads carry
 * no emails or user ids for customer topics. Failures are logged, never
 * thrown: typing must never delay messages or navigation.
 */
export async function publishBroadcast(topic: string, event: string, payload: Record<string, unknown>) {
  const supabase = createAdminClient();
  const channel = supabase.channel(topic, { config: { private: true } });
  try {
    const result = await channel.httpSend(event, payload, { timeout: 5000 });
    if (!result.success) console.warn("Broadcast not delivered", topic, event, result.status);
  } catch (error) {
    console.warn("Broadcast failed", topic, event, error instanceof Error ? error.message : error);
  } finally {
    await supabase.removeChannel(channel);
  }
}
