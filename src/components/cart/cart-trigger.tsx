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
      className="relative"
    >
      <ShoppingBag className="size-4" />
      {count > 0 && (
        <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Button>
  );
}
