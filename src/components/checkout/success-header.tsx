"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export function SuccessHeader({
  orderNumber,
  subtitle,
}: {
  orderNumber: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="bg-primary/10 flex size-14 items-center justify-center rounded-full"
      >
        <CheckCircle2 className="text-primary size-7" />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
        className="font-heading mt-5 text-2xl font-semibold tracking-tight sm:text-[28px]"
      >
        Order {orderNumber} placed
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
        className="text-muted-foreground mt-2 text-sm"
      >
        {subtitle}
      </motion.p>
    </div>
  );
}
