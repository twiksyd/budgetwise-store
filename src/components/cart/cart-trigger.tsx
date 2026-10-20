"use client";

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartStore, selectCartCount } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

export function CartTrigger() {
  const count = useCartStore(selectCartCount);
  const openCart = useUIStore((state) => state.openCart);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Open cart${count > 0 ? ` (${count} items)` : ""}`}
      onClick={openCart}
      data-cart-target
      className="relative"
    >
      <ShoppingBag className="size-4" />
      {count > 0 && (
        <span
          key={count}
          className="bg-primary text-primary-foreground animate-in zoom-in-50 absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-medium duration-300 motion-reduce:animate-none"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Button>
  );
}
