const formatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPrice(amount: number): string {
  return formatter.format(amount);
}

const paymentFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Amounts on payment cards: whole pesos as usual (₱250), and centavos
 * always with two digits (₱1,250.50, never ₱1,250.5), since the customer
 * types this exact amount into GCash.
 */
export function formatPaymentAmount(amount: number): string {
  return Number.isInteger(amount) ? formatter.format(amount) : paymentFormatter.format(amount);
}
