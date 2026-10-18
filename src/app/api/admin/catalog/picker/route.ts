import { loadCatalogForPicker } from "@/lib/queries/customer-thread";
import { chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

// GET: the real, customer-visible catalog for the chat's "Send product"
// picker (games + products with current price, Robux and availability).
// Admins only. Cached briefly per server instance: busy hours open the
// picker often and the catalog changes rarely; the card itself is always
// rebuilt from the live catalog when it is sent.
const TTL_MS = 30_000;
let cached: { at: number; body: Awaited<ReturnType<typeof loadCatalogForPicker>> } | null = null;

export async function GET(request: Request) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;
  try {
    if (!cached || Date.now() - cached.at > TTL_MS) cached = { at: Date.now(), body: await loadCatalogForPicker() };
    return chatJson(cached.body);
  } catch (error) {
    return routeErrorResponse(error, "Load catalog picker");
  }
}
