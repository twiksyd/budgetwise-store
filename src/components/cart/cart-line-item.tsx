"use client";

import Image from "next/image";
import { Gamepad2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/shared/price";
import { useCartStore } from "@/stores/cart-store";
import type { CartItem } from "@/types/domain";

export function CartLineItem({ item }: { item: CartItem }) {
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  return (
    <div className="surface-premium flex gap-3.5 rounded-2xl p-3.5">
      <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-xl">
        {item.gameIconUrl ? (
          <Image
            src={item.gameIconUrl}
            alt={item.gameName}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-6" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-heading truncate text-[14px] font-semibold">
              {item.name}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {item.gameName}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => removeItem(item.gamepassId)}
            aria-label="Remove item"
            className="-mt-1 -mr-1.5 shrink-0"
          >
            <X className="size-3.5" />
          </Button>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setQuantity(item.gamepassId, item.quantity - 1)}
              aria-label="Decrease quantity"
            >
              <Minus className="size-3" />
            </Button>
            <span className="w-5 text-center text-sm font-medium [font-variant-numeric:tabular-nums]">
              {item.quantity}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setQuantity(item.gamepassId, item.quantity + 1)}
              aria-label="Increase quantity"
            >
              <Plus className="size-3" />
            </Button>
          </div>
          <Price
            amount={item.price * item.quantity}
            variant="cart"
            className="mr-0.5 mb-0.5 self-end"
          />
        </div>
      </div>
    </div>
  );
}
