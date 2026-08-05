"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";
import { CartLineItem } from "@/components/cart/cart-line-item";
import type { CartItem } from "@/types/domain";

export function CartItems({ items }: { items: CartItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence initial={false}>
        {items.map((item, i) => (
          <motion.div
            key={item.gamepassId}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <CartLineItem item={item} />
            {i < items.length - 1 && <Separator className="mt-4" />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
