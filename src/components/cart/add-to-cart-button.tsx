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
  fullWidth = false,
}: {
  gamepass: StoreGamepass;
  gameId: string;
  gameSlug: string;
  gameName: string;
  fullWidth?: boolean;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const openCart = useUIStore((state) => state.openCart);

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className={fullWidth ? "block w-full" : "inline-block"}
    >
      <Button
        size={fullWidth ? "default" : "sm"}
        className={fullWidth ? "h-11 w-full" : undefined}
        onClick={() => {
          addItem({
            gamepassId: gamepass.id,
            gameId,
            gameSlug,
            gameName,
            name: gamepass.name,
            robuxAmount: gamepass.robux_amount,
            price: gamepass.price,
          });
          toast.success(`Added ${gamepass.name} to cart`);
          openCart();
        }}
      >
        Add to cart
      </Button>
    </motion.div>
  );
}
