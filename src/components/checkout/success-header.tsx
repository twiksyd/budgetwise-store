"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

export function SuccessHeader({ orderNumber }: { orderNumber: string }) {
  const [copied, setCopied] = useState(false);

  async function copyOrderNumber() {
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      toast.success("Order number copied.");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy the order number.");
    }
  }

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

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
        className="text-muted-foreground mt-3 text-xs font-semibold tracking-wide uppercase"
      >
        Order number created
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
        className="mt-1 inline-flex items-center gap-2"
      >
        <p className="font-heading text-primary text-3xl font-bold tracking-tight [font-variant-numeric:tabular-nums] sm:text-4xl">
          {orderNumber}
        </p>
        <button
          type="button"
          onClick={copyOrderNumber}
          aria-label="Copy order number"
          className="border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-9 items-center justify-center rounded-full border transition-colors"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35, ease: "easeOut" }}
        className="text-muted-foreground mt-2 max-w-xs text-sm leading-relaxed"
      >
        Your order is not being processed yet. Send it on Messenger to continue.
      </motion.p>
    </div>
  );
}
