// General Inquiry payment quotes (0031): the amount an admin types. Same
// rules as the database (store_send_inquiry_payment_details): PHP, more
// than 0, at most 1,000,000, at most two decimals. Commas are allowed while
// typing ("1,250.50"); anything else is refused, never guessed.
export const MAX_QUOTE_AMOUNT = 1_000_000;

/** A valid peso amount as a number, or null. */
export function parseQuoteAmount(value) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(/,/g, "") : "";
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_QUOTE_AMOUNT) return null;
  return Math.round(amount * 100) / 100;
}
