import { isUuid, sniffImageType, validateAttachmentMeta } from "@/lib/order-chat.mjs";
import { validatePaymentMethodInput } from "@/lib/chat/admin-input.mjs";
import { listPaymentMethods, savePaymentMethod, uploadPaymentQr } from "@/lib/queries/order-chat";
import { chatError, chatJson, requireAdminApi, routeErrorResponse } from "@/lib/order-chat-http";

const MAX_QR_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request) {
  const gate = await requireAdminApi(request, { mutating: false });
  if (!gate.ok) return gate.response;
  try {
    return chatJson({ methods: await listPaymentMethods() });
  } catch (error) {
    return routeErrorResponse(error, "List payment methods");
  }
}

// POST multipart: id? (edit), label, accountName, accountNumber, isActive,
// sortOrder, qr? (image), removeQr? — audited in the database.
export async function POST(request: Request) {
  const gate = await requireAdminApi(request, { mutating: true });
  if (!gate.ok) return gate.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return chatError("Invalid request.", 400);
  }

  const rawId = form.get("id");
  const id = rawId ? String(rawId) : null;
  if (id !== null && !isUuid(id)) return chatError("Invalid request.", 400);

  const input = validatePaymentMethodInput({
    label: form.get("label"),
    accountName: form.get("accountName"),
    accountNumber: form.get("accountNumber"),
    isActive: form.get("isActive") === "true",
    sortOrder: form.get("sortOrder"),
  });
  if (!input.ok) return chatError(input.error, 400);

  try {
    let newQrPath: string | null = null;
    const qr = form.get("qr");
    if (qr instanceof File && qr.size > 0) {
      if (qr.size > MAX_QR_BYTES) return chatError("QR image must be 2 MB or smaller.", 400);
      const meta = validateAttachmentMeta({ type: qr.type, size: qr.size });
      if (!meta.ok) return chatError(meta.error, 400);
      const bytes = new Uint8Array(await qr.arrayBuffer());
      const sniffed = sniffImageType(bytes);
      if (!sniffed || sniffed !== qr.type) return chatError("Only JPG, PNG, or WebP images.", 400);
      newQrPath = await uploadPaymentQr(bytes, sniffed, meta.extension);
    }

    const method = await savePaymentMethod(gate.adminId, {
      id,
      ...input,
      newQrPath,
      removeQr: form.get("removeQr") === "true",
    });
    return chatJson({ method }, id ? 200 : 201);
  } catch (error) {
    return routeErrorResponse(error, "Save payment method");
  }
}
