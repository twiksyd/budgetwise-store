"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Gamepad2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cart-store";
import { MAX_QUANTITY_PER_PRODUCT } from "@/lib/validations/order";
import { cn } from "@/lib/utils";
import { AnimatedPrice } from "@/components/shared/animated-price";
import type { CartItem } from "@/types/domain";

const stepButton =
  "text-foreground flex size-10 items-center justify-center transition-[background-color,transform] duration-100 outline-none select-none hover:bg-foreground/[0.05] active:scale-90 active:bg-foreground/10 focus-visible:ring-primary/50 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-35";

export function CartLineItem({ item }: { item: CartItem }) {
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  // A cart persisted from before this cap existed can already be over it —
  // that's distinct from a customer having simply reached the cap normally.
  const exceedsMax = item.quantity > MAX_QUANTITY_PER_PRODUCT;
  const atCap = item.quantity === MAX_QUANTITY_PER_PRODUCT;
  const increaseDisabled = item.quantity >= MAX_QUANTITY_PER_PRODUCT;

  // Briefly lift the subtotal when the quantity changes (CSS only; skipped
  // for reduced motion in globals.css). The number itself counts to its new
  // value inside AnimatedPrice.
  const subtotalRef = useRef<HTMLSpanElement>(null);
  const previousQuantity = useRef(item.quantity);
  useEffect(() => {
    if (previousQuantity.current === item.quantity) return;
    previousQuantity.current = item.quantity;
    const node = subtotalRef.current;
    if (!node) return;
    node.classList.remove("bw-subtotal-flash");
    void node.offsetWidth; // restart the animation on rapid taps
    node.classList.add("bw-subtotal-flash");
  }, [item.quantity]);

  function handleIncrease() {
    const result = setQuantity(item.gamepassId, item.quantity + 1);
    if (!result.ok) {
      toast.error(`Max na ${MAX_QUANTITY_PER_PRODUCT} pieces per item ang pwede.`);
    }
  }

  return (
    <div
      className={cn(
        "bg-card flex gap-3.5 rounded-2xl p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]",
        exceedsMax && "ring-destructive/50",
      )}
    >
      <div className="bg-muted relative size-[76px] shrink-0 overflow-hidden rounded-xl">
        {item.gameIconUrl ? (
          <Image
            src={item.gameIconUrl}
            alt={item.gameName}
            fill
            sizes="76px"
            className="object-cover"
          />
        ) : (
          <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-6" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-heading line-clamp-2 text-[15px] leading-snug font-semibold break-words">
              {item.name}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{item.gameName}</p>
          </div>
          <button
            type="button"
            onClick={() => removeItem(item.gamepassId)}
            aria-label={`Remove ${item.name}`}
            className="text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.05] active:bg-foreground/10 focus-visible:ring-primary/50 -mt-2 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          {/* One segmented control: minus · quantity · plus. */}
          <div className="border-border/80 bg-background inline-flex items-center overflow-hidden rounded-full border">
            <button
              type="button"
              onClick={() => setQuantity(item.gamepassId, item.quantity - 1)}
              aria-label={`Decrease quantity of ${item.name}`}
              className={stepButton}
            >
              <Minus className="size-3.5" />
            </button>
            <span
              className="w-7 text-center text-sm font-semibold tabular-nums"
              aria-live="polite"
              aria-label={`Quantity ${item.quantity}`}
            >
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={handleIncrease}
              disabled={increaseDisabled}
              aria-label={`Increase quantity of ${item.name}`}
              className={stepButton}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <span ref={subtotalRef} className="inline-flex origin-right">
            <AnimatedPrice amount={item.price * item.quantity} variant="cart" />
          </span>
        </div>
        {exceedsMax ? (
          <p className="text-destructive mt-1.5 text-[11px] font-medium" role="alert">
            Sobra sa max na {MAX_QUANTITY_PER_PRODUCT} pieces. Bawasan ang dami para
            makapag-checkout.
          </p>
        ) : (
          atCap && (
            <p className="text-muted-foreground mt-1.5 text-[11px]" role="status">
              Max na dami: {MAX_QUANTITY_PER_PRODUCT} pieces per item.
            </p>
          )
        )}
      </div>
    </div>
  );
}
