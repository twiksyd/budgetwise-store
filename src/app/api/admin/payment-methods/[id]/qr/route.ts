import { signPaymentMethodQr } from "@/lib/queries/order-chat";
import { chatError, requireAdminApi, routeErrorResponse, sendCoreResult } from "@/lib/order-chat-http";

type Context = { params: Promise<{ id: string }> };

// Admin preview of a configured QR. Customers only ever reach a QR through
// a payment message they own (/api/order-chat/<order>/payment-qr/<id>).
export async function GET(request: Request, { params }: Context) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;
  const { id } = await params;
  try {
    const url = await signPaymentMethodQr(id);
    return url ? sendCoreResult({ status: 302, location: url }) : chatError("Not found.", 404);
  } catch (error) {
    return routeErrorResponse(error, "Open payment QR preview");
  }
}
