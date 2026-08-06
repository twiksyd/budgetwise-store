"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CartPanelContent } from "@/components/cart/cart-panel-content";
import { useCartStore, selectCartCount } from "@/stores/cart-store";

export function DesktopCartDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const count = useCartStore(selectCartCount);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0">
        <SheetHeader className="border-border/60 border-b">
          <SheetTitle className="text-base">
            Your cart
            {count > 0 && (
              <span className="text-muted-foreground ml-1.5 font-normal">
                · {count} item{count === 1 ? "" : "s"}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <CartPanelContent onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
