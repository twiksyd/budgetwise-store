"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { MAX_DISTINCT_ORDER_ITEMS } from "@/lib/validations/order";
import type { CartItem } from "@/types/domain";

export function CartItems({ items }: { items: CartItem[] }) {
  const overDistinctProducts = items.length > MAX_DISTINCT_ORDER_ITEMS;

  return (
    <div className="flex flex-col gap-3">
      {overDistinctProducts && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 rounded-xl border p-3 text-sm"
        >
          <p className="text-destructive font-semibold">
            {items.length} magkakaibang produkto sa cart — max po ay{" "}
            {MAX_DISTINCT_ORDER_ITEMS}.
          </p>
          <p className="text-destructive/90 mt-0.5 text-xs leading-relaxed">
            Alisin ang ilang item para makapag-checkout.
          </p>
        </div>
      )}
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.gamepassId}
            layout
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, x: 24, transition: { duration: 0.28, ease: [0.65, 0, 0.35, 1] } }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            <CartLineItem item={item} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
