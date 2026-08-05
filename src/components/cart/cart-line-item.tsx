"use client";

import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/pricing";
import { useCartStore } from "@/stores/cart-store";
import type { CartItem } from "@/types/domain";

export function CartLineItem({ item }: { item: CartItem }) {
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-heading truncate text-[14px] font-semibold">
          {item.name}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {item.gameName} · {item.robuxAmount.toLocaleString()} Robux
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() =>
              setQuantity(item.gamepassId, item.quantity - 1)
            }
            aria-label="Decrease quantity"
          >
            <Minus className="size-3" />
          </Button>
          <span className="w-4 text-center text-sm">{item.quantity}</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() =>
              setQuantity(item.gamepassId, item.quantity + 1)
            }
            aria-label="Increase quantity"
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <p className="text-sm font-semibold">
          {formatPrice(item.price * item.quantity)}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => removeItem(item.gamepassId)}
          aria-label="Remove item"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
