"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/pricing";
import { copyPlainText } from "@/lib/plain-text-clipboard";
import { cn } from "@/lib/utils";
import type { OrderConfirmation } from "@/lib/queries/orders";

const EASE = [0.16, 1, 0.3, 1] as const;
const COPIED_MS = 2000;

// The completed order: one receipt, a copy action in its header, and the
// Messenger hand-off right under it. Everything the customer sends is the
// formatted `message` (the same text the Messenger link pre-fills).
export function MessengerHandoff({
  order,
  message,
  messengerLink,
}: {
  order: OrderConfirmation;
  message: string;
  messengerLink: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function markCopied() {
    setCopied(true);
    setCopyFailed(false);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  function showFallback() {
    setCopyFailed(true);
    // Let the textarea render, then select it so a long-press copies it all.
    requestAnimationFrame(() => {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    });
  }

  async function handleCopy() {
    try {
      await copyPlainText(message);
      markCopied();
    } catch {
      showFallback();
    }
  }

  // A real link, followed inside the tap: navigating after an await makes
  // iOS and the Facebook in-app browser open m.me as a web page instead of
  // the Messenger app (and drop the pre-filled text). The clipboard write
  // starts in the same tap, so the slip is ready to paste either way.
  function handleOpenMessenger() {
    copyPlainText(message)
      .then(() => {
        markCopied();
        toast.success("Order slip copied. I-paste sa Messenger.");
      })
      .catch(showFallback);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <motion.article
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="bg-card overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_40px_-20px_rgba(0,0,0,0.22)] ring-1 ring-black/5 dark:ring-white/10"
        aria-label={`Order slip ${order.orderNumber}`}
      >
        <div className="bg-primary h-1" aria-hidden />

        <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              Order Slip
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">
              {order.orderNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            aria-live="polite"
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              copied
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-primary hover:bg-primary/5 active:bg-primary/10",
            )}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied!" : "Copy Order Slip"}
          </button>
        </header>

        <dl className="mt-5 space-y-2 px-5 text-sm sm:px-6">
          <SlipRow label="Name" value={order.buyerName} />
          <SlipRow label="Roblox Username" value={order.buyerRobloxUsername} />
          {order.viaPlusAccount && (
            <SlipRow
              label="Display Name"
              value={order.viaPlusAccount.robloxDisplayName}
            />
          )}
        </dl>

        <div className="border-border mx-5 mt-5 border-t border-dashed sm:mx-6" aria-hidden />

        <ul className="space-y-3.5 px-5 pt-5 sm:px-6">
          {order.lines.map((line, index) => (
            <motion.li
              key={`${line.gamepassId}-${index}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.15 + Math.min(index, 6) * 0.05 }}
              className="flex items-start justify-between gap-4 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium break-words">
                  {line.gamepassName}
                  {line.quantity > 1 && (
                    <span className="text-muted-foreground font-normal"> × {line.quantity}</span>
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {line.gameName} · {line.robuxAmount.toLocaleString()} Robux
                </p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">
                {formatPrice(line.sellingPrice)}
              </span>
            </motion.li>
          ))}
        </ul>

        <div className="bg-muted/50 mt-5 flex items-baseline justify-between px-5 py-4 sm:px-6">
          <span className="text-sm font-medium">Total</span>
          <span className="font-heading text-primary text-2xl font-bold tracking-tight tabular-nums">
            {formatPrice(order.total)}
          </span>
        </div>
      </motion.article>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
        className="mt-5"
      >
        {messengerLink ? (
          <Button asChild size="lg" className="h-12 w-full text-base font-semibold active:scale-[0.98] sm:h-12">
            <a href={messengerLink} onClick={handleOpenMessenger}>
              <Send className="size-4.5" />
              Send on Messenger
            </a>
          </Button>
        ) : (
          <Button size="lg" className="h-12 w-full text-base font-semibold sm:h-12" disabled>
            <Send className="size-4.5" />
            Send on Messenger
          </Button>
        )}

        <p className="text-muted-foreground mt-3 text-center text-xs leading-relaxed">
          Hintayin ang reply at payment instructions bago magbayad.
        </p>
      </motion.div>

      {copyFailed && (
        <div className="mt-6" role="alert">
          <p className="text-sm font-medium">
            Hindi na-copy. Piliin ang buong text sa baba at i-copy.
          </p>
          <textarea
            ref={fallbackRef}
            readOnly
            value={message}
            rows={8}
            onFocus={(event) => event.currentTarget.select()}
            className="border-border bg-muted/40 mt-2 w-full resize-none rounded-xl border p-3 font-sans text-[13px] leading-relaxed"
            aria-label="Buong order slip"
          />
        </div>
      )}
    </div>
  );
}

function SlipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}
