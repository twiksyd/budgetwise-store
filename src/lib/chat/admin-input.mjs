// Input validation for admin-managed settings (quick replies, payment
// accounts). The database enforces the same rules; these give friendly
// messages first.

const SHORTCUT_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export function validateQuickReplyInput(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  const shortcut = String(input.shortcut ?? "").trim().replace(/^\//, "").toLowerCase();
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").replace(/\r\n?/g, "\n").trim();
  const isEnabled = input.isEnabled === undefined ? true : input.isEnabled === true;

  if (!SHORTCUT_RE.test(shortcut)) {
    return { ok: false, error: "Shortcut: letters, numbers, - or _ only (max 32), e.g. was." };
  }
  if (title.length < 1 || title.length > 80 || CONTROL_RE.test(title) || /\n/.test(title)) {
    return { ok: false, error: "Title is required (max 80 characters)." };
  }
  if (body.length < 1 || body.length > 2000 || CONTROL_RE.test(body)) {
    return { ok: false, error: "Message is required (max 2,000 characters)." };
  }
  return { ok: true, shortcut, title, body, isEnabled };
}

export function validatePaymentMethodInput(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid request." };
  const label = String(input.label ?? "GCash").trim() || "GCash";
  const accountName = String(input.accountName ?? "").trim();
  const accountNumber = String(input.accountNumber ?? "").replace(/[\s-]/g, "");
  const isActive = input.isActive === undefined ? true : input.isActive === true || input.isActive === "true";
  const sortOrder = Number.parseInt(String(input.sortOrder ?? "0"), 10);

  if (label.length > 40 || CONTROL_RE.test(label)) return { ok: false, error: "Label is too long." };
  if (accountName.length < 1 || accountName.length > 80 || CONTROL_RE.test(accountName)) {
    return { ok: false, error: "Account name is required (max 80 characters)." };
  }
  if (!/^09[0-9]{9}$/.test(accountNumber)) {
    return { ok: false, error: "GCash number must be 11 digits starting with 09." };
  }
  return {
    ok: true,
    label,
    accountName,
    accountNumber,
    isActive,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}
