"use client";

import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import type { StoreGamepass } from "@/types/database";

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

  return (
    <motion.div
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={fullWidth ? "block w-full" : "inline-block"}
    >
      <Button
        size={fullWidth ? "default" : "sm"}
        className={fullWidth ? "h-11 w-full" : undefined}
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
        {label ?? "Add to cart"}
      </Button>
    </motion.div>
  );
}
