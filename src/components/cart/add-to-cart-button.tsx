"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getProductDisplayName } from "@/lib/product-display-name";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import {
  MAX_DISTINCT_ORDER_ITEMS,
  MAX_QUANTITY_PER_PRODUCT,
} from "@/lib/validations/order";
import type { StoreGamepass } from "@/types/database";

const ADDED_STATE_MS = 1400;

export function AddToCartButton({
  gamepass,
  gameId,
  gameSlug,
  gameName,
  gameIconUrl = null,
  fullWidth = false,
  disabled = false,
  label,
}: {
  gamepass: StoreGamepass;
  gameId: string;
  gameSlug: string;
  gameName: string;
  gameIconUrl?: string | null;
  fullWidth?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const closeCart = useUIStore((state) => state.closeCart);
  const cartQuantity = useCartStore(
    (state) =>
      state.items.find((i) => i.gamepassId === gamepass.id)?.quantity ?? 0,
  );
  const cartProductCount = useCartStore((state) => state.items.length);
  const [justAdded, setJustAdded] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productName = getProductDisplayName(gamepass);

  const isInCart = cartQuantity > 0;
  const quantityLimitReached = isInCart && cartQuantity >= MAX_QUANTITY_PER_PRODUCT;
  const productLimitReached =
    !isInCart && cartProductCount >= MAX_DISTINCT_ORDER_ITEMS;
  const cartLimitReached = quantityLimitReached || productLimitReached;

  useEffect(() => {
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  return (
    <motion.div
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={fullWidth ? "block w-full" : "inline-block"}
    >
      <Button
        size={fullWidth ? "default" : "sm"}
        className={cn(
          fullWidth &&
            "h-11 w-full rounded-xl px-3 text-sm font-semibold shadow-[0_10px_24px_-16px_color-mix(in_oklch,var(--primary)_60%,transparent)] sm:h-10",
          // Local, in-place confirmation exactly where the customer
          // tapped — the toast still fires, but this doesn't ask them to
          // glance somewhere else to know it worked.
          justAdded &&
            "bg-emerald-600 hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-500",
        )}
        disabled={disabled || cartLimitReached}
        onClick={() => {
          const result = addItem({
            gamepassId: gamepass.id,
            gameId,
            gameSlug,
            gameName,
            gameIconUrl,
            name: productName,
            robuxAmount: gamepass.robux_amount,
            price: gamepass.price,
          });

          if (!result.ok) {
            toast.error(
              result.reason === "MAX_PRODUCTS"
                ? `Puno na ang cart (max ${MAX_DISTINCT_ORDER_ITEMS} na magkakaibang item).`
                : `Max na ${MAX_QUANTITY_PER_PRODUCT} pieces per item ang pwede.`,
            );
            return;
          }

          setJustAdded(true);
          if (revertTimer.current) clearTimeout(revertTimer.current);
          revertTimer.current = setTimeout(
            () => setJustAdded(false),
            ADDED_STATE_MS,
          );

          // Adding an item shouldn't interrupt browsing — a quiet toast
          // with a "View Cart" escape hatch instead of yanking the sheet
          // open, so the customer decides when they're ready to look.
          toast.success("Na-add na sa cart.", {
            description: "Pwede pa kayong magdagdag ng ibang item.",
            action: {
              label: "Tingnan ang Cart",
              onClick: () => {
                closeCart();
                router.push("/cart");
              },
            },
          });
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {justAdded ? (
            <motion.span
              key="added"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1.5"
            >
              <Check className="size-4" />
              Na-add
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1.5"
            >
              {!disabled && !cartLimitReached && !label && (
                <ShoppingBag className="size-4" />
              )}
              {label ??
                (cartLimitReached
                  ? quantityLimitReached
                    ? "Max na sa Cart"
                    : "Puno na ang Cart"
                  : "I-add sa Cart")}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </motion.div>
  );
}
