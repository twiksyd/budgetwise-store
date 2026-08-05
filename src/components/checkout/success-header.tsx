"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export function SuccessHeader({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="bg-primary/10 flex size-20 items-center justify-center rounded-full"
      >
        <CheckCircle2 className="text-primary size-10" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
        className="text-muted-foreground mt-5 text-xs font-semibold tracking-wide uppercase"
      >
        Order placed
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
        className="font-heading text-primary mt-1 text-4xl font-bold tracking-tight [font-variant-numeric:tabular-nums] sm:text-5xl"
      >
        {orderNumber}
      </motion.p>
    </div>
  );
}
