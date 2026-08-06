import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type PriceVariant = "product" | "productCompact" | "cart" | "summary" | "line";

const priceVariants: Record<PriceVariant, string> = {
  product: "text-[1.75rem]/[0.92]",
  productCompact: "text-[1.5rem]/[0.95]",
  cart: "text-[1.0625rem]/[1]",
  summary: "text-[1.5rem]/[0.95]",
  line: "text-[0.875rem]/[1]",
};

export function Price({
  amount,
  variant = "product",
  className,
}: {
  amount: number;
  variant?: PriceVariant;
  className?: string;
}) {
  const formatted = formatPrice(amount);
  const symbol = formatted.slice(0, 1);
  const value = formatted.slice(1);

  return (
    <span
      aria-label={formatted}
      className={cn(
        "font-heading text-primary inline-flex items-baseline whitespace-nowrap font-extrabold tracking-[-0.03em] [font-variant-numeric:tabular-nums]",
        priceVariants[variant],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mr-[0.06em] translate-y-[-0.03em] text-[0.72em] font-bold tracking-[-0.015em]"
      >
        {symbol}
      </span>
      <span aria-hidden="true">{value}</span>
    </span>
  );
}
