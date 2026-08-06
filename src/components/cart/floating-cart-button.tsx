"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCartStore, selectCartCount } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";

// Mobile-only, thumb-reachable cart entry point — the header's cart icon
// still exists (muscle memory, discoverability), but it's a stretch at the
// top of a one-handed phone grip. Only rendered once there's something in
// the cart; an empty floating button on every single page is just clutter.
export function FloatingCartButton() {
  const count = useCartStore(selectCartCount);
  const openCart = useUIStore((state) => state.openCart);
  const pathname = usePathname();

  // Product pages already have a persistent header cart. Hiding the floating
  // shortcut there prevents it from covering price or Add to Cart controls
  // inside compact in-app browser viewports.
  const isProductBrowsingPage = pathname?.startsWith("/games/");

  if (isProductBrowsingPage) return null;

  return (
    <div
      className="fixed right-4 z-40 sm:hidden"
      style={{ bottom: "calc(8rem + env(safe-area-inset-bottom))" }}
    >
      <AnimatePresence>
        {count > 0 && (
          <motion.button
            type="button"
            onClick={openCart}
            aria-label={`Open cart (${count} item${count === 1 ? "" : "s"})`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="bg-primary text-primary-foreground relative flex size-14 items-center justify-center rounded-full shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)]"
          >
            <ShoppingBag className="size-5" />
            <AnimatePresence mode="popLayout">
              <motion.span
                key={count}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className="bg-background text-primary ring-primary/20 absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full text-[11px] font-bold ring-2"
              >
                {count > 9 ? "9+" : count}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
