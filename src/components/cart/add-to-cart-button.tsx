"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
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
  const addItem = useCartStore((state) => state.addItem);
  const openCart = useUIStore((state) => state.openCart);
  const [justAdded, setJustAdded] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        disabled={disabled}
        onClick={() => {
          addItem({
            gamepassId: gamepass.id,
            gameId,
            gameSlug,
            gameName,
            gameIconUrl,
            name: gamepass.name,
            robuxAmount: gamepass.robux_amount,
            price: gamepass.price,
          });

          setJustAdded(true);
          if (revertTimer.current) clearTimeout(revertTimer.current);
          revertTimer.current = setTimeout(
            () => setJustAdded(false),
            ADDED_STATE_MS,
          );

          // Adding an item shouldn't interrupt browsing — a quiet toast
          // with a "View Cart" escape hatch instead of yanking the sheet
          // open, so the customer decides when they're ready to look.
          toast.success(`${gamepass.name} added to cart`, {
            action: {
              label: "View Cart",
              onClick: () => openCart(),
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
              Added
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
              {!disabled && !label && <ShoppingBag className="size-4" />}
              {label ?? "Add to cart"}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </motion.div>
  );
}
