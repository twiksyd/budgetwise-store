// Typing / viewing signals between admins.
//
// Browsers cannot publish to realtime topics at all (no insert policy on
// realtime.messages). They ask the server; the server publishes with the
// admin id taken from the verified session. Anything identity-like in the
// request body (admin_user_id, display_name, ...) is ignored, and the
// published event carries no name — receivers map the id to the trusted
// admin_users.display_name.
import { isValidOrderNumber } from "../order-chat.mjs";

export const SIGNAL_TYPES = Object.freeze(["viewing", "typing", "stopped", "left"]);
// Client-side cadence (see the admin inbox): viewing every 20s, typing at
// most every 2.5s. 40 per 20s leaves ample room for both plus tab switches.
export const SIGNAL_RATE_LIMIT = Object.freeze({ limit: 40, windowMs: 20_000 });

export function parseSignalBody(body) {
  if (!body || typeof body !== "object") return null;
  const { type, orderNumber } = body;
  if (!SIGNAL_TYPES.includes(type)) return null;
  if (!isValidOrderNumber(orderNumber)) return null;
  return { type, orderNumber };
}

export function createSignalHandler({ resolveAdmin, publish, limiter, now = () => Date.now() }) {
  return async function handleSignal(body) {
    const admin = await resolveAdmin();
    if (!admin) return { status: 401, body: { error: "Not allowed." } };

    const signal = parseSignalBody(body);
    if (!signal) return { status: 400, body: { error: "Invalid signal." } };

    const allowed = limiter.take(admin.id);
    if (!allowed.ok) {
      return {
        status: 429,
        body: { error: "Too many signals." },
        retryAfterMs: allowed.retryAfterMs,
      };
    }

    const event = {
      type: signal.type,
      admin_user_id: admin.id,
      order_number: signal.orderNumber,
      at: new Date(now()).toISOString(),
    };
    await publish(event);
    return { status: 202, body: { ok: true } };
  };
}
