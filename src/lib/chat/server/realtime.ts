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
