"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CartLineItem } from "@/components/cart/cart-line-item";
import type { CartItem } from "@/types/domain";

export function CartItems({ items }: { items: CartItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.gamepassId}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <CartLineItem item={item} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
