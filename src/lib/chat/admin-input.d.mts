export function validateQuickReplyInput(input: unknown):
  | { ok: true; shortcut: string; title: string; body: string; isEnabled: boolean }
  | { ok: false; error: string };
export function validatePaymentMethodInput(input: unknown):
  | { ok: true; label: string; accountName: string; accountNumber: string; isActive: boolean; sortOrder: number }
  | { ok: false; error: string };
