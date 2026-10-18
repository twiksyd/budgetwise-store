export const MAX_MESSAGE_LENGTH: number;
export const MAX_ATTACHMENT_BYTES: number;
export const MESSAGE_RATE_LIMIT: { count: number; windowSeconds: number };
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string>;

export type ChatMessageKind = "slip" | "text" | "image" | "payment" | "album" | "product";

export function isValidOrderNumber(value: unknown): value is string;
/** A General Inquiry thread key (GI-XXXXXXXX), never an order number. */
export function isInquiryKey(value: unknown): value is string;
export function isUuid(value: unknown): value is string;

export type ValidationResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export function validateMessageBody(
  input: unknown,
  options?: { allowEmpty?: boolean },
): ValidationResult<{ body: string }>;

export function validateAttachmentMeta(input: {
  type: string;
  size: number;
}): ValidationResult<{ extension: string }>;

export function sniffImageType(
  bytes: Uint8Array | null | undefined,
): "image/jpeg" | "image/png" | "image/webp" | null;

export function inspectImage(
  bytes: Uint8Array | null | undefined,
): { type: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number } | null;

export function buildAttachmentPath(input: {
  orderNumber: string;
  messageId: string;
  extension: string;
}): string;

export function sanitizeNextPath(value: unknown, fallback?: string): string;

export function previewMessage(
  message: { kind: ChatMessageKind; body: string } | null | undefined,
  maxLength?: number,
): string;
