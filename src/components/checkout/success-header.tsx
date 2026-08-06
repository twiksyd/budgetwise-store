"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export function SuccessHeader() {
  return (
    <div className="mt-3">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex items-center justify-center gap-2.5 text-center"
      >
        <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-full">
          <CheckCircle2 className="text-primary size-5" />
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          I-send na ang Inyong Order
        </h1>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
        className="text-muted-foreground mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed"
      >
        Hindi pa po namin mare-review ang order hangga&apos;t hindi ninyo ito
        naipapadala sa Messenger.
      </motion.p>
    </div>
  );
}
