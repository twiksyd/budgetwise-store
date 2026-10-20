"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Variant = "cart" | "summary" | "line";

const variants: Record<Variant, string> = {
  cart: "text-[1.0625rem]/[1]",
  summary: "text-[1.5rem]/[0.95]",
  line: "text-[0.875rem]/[1]",
};

/**
 * Price (same look as <Price>) that counts smoothly to its new value when it
 * changes — cart quantities, subtotals. Screen readers get the final value.
 */
export function AnimatedPrice({
  amount,
  variant = "cart",
  className,
}: {
  amount: number;
  variant?: Variant;
  className?: string;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(amount);
  const reduce = useReducedMotion();
  const formatted = formatPrice(amount);

  useEffect(() => {
    const from = previous.current;
    previous.current = amount;
    const node = valueRef.current;
    if (!node || from === amount || reduce) return;
    const whole = Number.isInteger(from) && Number.isInteger(amount);
    const controls = animate(from, amount, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => {
        node.textContent = formatPrice(whole ? Math.round(value) : Math.round(value * 100) / 100).slice(1);
      },
    });
    return () => controls.stop();
  }, [amount, reduce]);

  return (
    <span
      aria-label={formatted}
      className={cn(
        "font-heading text-primary inline-flex items-baseline whitespace-nowrap font-extrabold tracking-[-0.03em] [font-variant-numeric:tabular-nums]",
        variants[variant],
        className,
      )}
    >
      <span aria-hidden="true" className="mr-[0.06em] translate-y-[-0.03em] text-[0.72em] font-bold tracking-[-0.015em]">
        {formatted.slice(0, 1)}
      </span>
      <span aria-hidden="true" ref={valueRef}>
        {formatted.slice(1)}
      </span>
    </span>
  );
}
