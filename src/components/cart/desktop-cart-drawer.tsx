"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CartPanelContent } from "@/components/cart/cart-panel-content";

export function DesktopCartDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0">
        <SheetHeader className="border-border/60 border-b">
          <SheetTitle className="text-base">Your cart</SheetTitle>
        </SheetHeader>

        <CartPanelContent onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
