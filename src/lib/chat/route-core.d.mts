export const PAYMENT_QR_PATH_RE: RegExp;
type Viewer = { ok: true } | { ok: false; status: number };
type RouteResult =
  | { status: 302; location: string }
  | { status: number; body: unknown };
export function handlePaymentQr(input: {
  orderNumber: string;
  messageId: string;
  deps: {
    resolveViewer(orderNumber: string): Promise<Viewer>;
    loadMessage(orderNumber: string, messageId: string): Promise<{
      order_number: string;
      kind: string;
      payload?: { qr_path?: unknown } | null;
    } | null>;
    signQr(path: string): Promise<string>;
  };
}): Promise<RouteResult>;
export function handleAttachment(input: {
  messageId: string;
  deps: {
    loadMessage(messageId: string): Promise<{ order_number: string; attachment_path: string | null } | null>;
    resolveViewer(orderNumber: string): Promise<Viewer>;
    signAttachment(path: string): Promise<string>;
  };
}): Promise<RouteResult>;
export function handleFulfillmentSave(input: {
  orderNumber: string;
  body: unknown;
  deps: {
    resolveActor(orderNumber: string): Promise<{ ok: true; userId: string } | { ok: false; status: number }>;
    loadLines(orderNumber: string): Promise<{ lineIndex: number; gameId: string | null; quantity: number }[]>;
    save(input: {
      lineIndex: number;
      unitIndex: number;
      fieldKey: string;
      value: string;
      externalId: string;
      actorId: string;
    }): Promise<{ value: string; external_id: string | null; source: string; updated_at: string } | null>;
  };
}): Promise<{ status: number; body: unknown }>;
export function handleAlbumMedia(input: {
  attachmentId: string;
  size: "thumb" | "full";
  deps: {
    loadAttachment(id: string): Promise<{ order_number: string; storage_path: string; thumb_path: string } | null>;
    resolveViewer(orderNumber: string): Promise<{ ok: true } | { ok: false; status: number }>;
    sign(path: string): Promise<string>;
  };
}): Promise<RouteResult>;
