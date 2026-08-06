"use client";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CartPanelContent } from "@/components/cart/cart-panel-content";
import { useCartStore, selectCartCount } from "@/stores/cart-store";

export function MobileCartDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const count = useCartStore(selectCartCount);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* `dvh` (not `vh`) so the sheet's height is measured against the
          viewport mobile Safari/Chrome actually render visually, not the
          value including area hidden behind the address/toolbar — using
          `vh` here was why the sticky checkout bar could end up rendered
          below the fold on some phones. No snapPoints: vaul's fractional
          snap points were producing an incorrect transform that pushed
          most of the sheet (including the checkout bar) off-screen —
          the plain single-height mode is vaul's default, well-tested
          behavior and still supports swipe-down-to-dismiss / tap-outside. */}
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[85dvh] rounded-t-3xl">
        <DrawerHeader className="border-border/60 shrink-0 border-b pb-4">
          <DrawerTitle className="text-base">
            Your cart
            {count > 0 && (
              <span className="text-muted-foreground ml-1.5 font-normal">
                · {count} item{count === 1 ? "" : "s"}
              </span>
            )}
          </DrawerTitle>
        </DrawerHeader>

        <CartPanelContent onClose={() => onOpenChange(false)} />
      </DrawerContent>
    </Drawer>
  );
}
