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
        className="bg-primary/10 flex size-14 items-center justify-center rounded-full sm:size-16"
      >
        <CheckCircle2 className="text-primary size-7 sm:size-8" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
        className="font-heading mt-3 text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        Your Order Slip Is Ready
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
        className="text-destructive mt-2 text-sm font-semibold"
      >
        Your order has not been submitted yet.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35, ease: "easeOut" }}
        className="border-border bg-muted/50 mt-4 rounded-xl border px-3.5 py-2.5"
      >
        <p className="text-muted-foreground text-xs font-medium">
          Order reference
        </p>
        <p className="font-heading text-foreground text-lg font-semibold tracking-tight [font-variant-numeric:tabular-nums]">
          {orderNumber}
        </p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45, ease: "easeOut" }}
        className="text-muted-foreground mt-3 max-w-sm text-sm leading-relaxed"
      >
        Send the full prepared order message to BudgetWise on Messenger so we
        can review it.
      </motion.p>
    </div>
  );
}
