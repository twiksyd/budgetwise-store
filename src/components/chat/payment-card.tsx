"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Dialog as DialogPrimitive } from "radix-ui";
import { BadgeCheck, ChevronDown, QrCode, Wallet, X } from "lucide-react";
import type { PaymentCard as PaymentCardData, PaymentReceived } from "@/lib/chat/dto.mjs";
import { formatPaymentAmount } from "@/lib/pricing";
import { CopyButton } from "@/components/chat/copy-button";
import { ImageLightbox } from "@/components/chat/image-lightbox";
import { cn } from "@/lib/utils";

/**
 * Admin-only actions for payment cards (0027), provided by the admin
 * conversation view. Customers have no provider, so they never see them.
 */
export interface PaymentConfirmActions {
  /**
   * Cards that can be confirmed now: the latest unconfirmed card of each
   * order (0033: a customer conversation can hold several orders and
   * quotes; each is confirmed on its own).
   */
  confirmableIds: ReadonlySet<string>;
  /** Resolves true once the server has recorded (or already had) the confirmation. */
  confirm: (messageId: string) => Promise<boolean>;
  /** Internal admin name for "Confirmed by …". */
  nameFor: (adminId: string | null | undefined) => string | null;
}

export const PaymentConfirmContext = createContext<PaymentConfirmActions | null>(null);

const WHEN = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Cards whose "Payment Received" moment this browser has already shown, so
// the animation plays once — when the confirmation first reaches an open
// chat — and never again after a reload. Best effort: without storage the
// rule "a card loaded already confirmed is shown static" still holds.
const SEEN_KEY = "bw:payment-received-seen";
const SEEN_LIMIT = 100;

function readSeen(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function markSeen(messageId: string) {
  try {
    const list = readSeen().filter((id) => id !== messageId);
    list.push(messageId);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_LIMIT)));
  } catch {
    // Private mode / storage blocked: nothing to remember.
  }
}

/**
 * True only for the live unconfirmed -> confirmed change this browser has
 * not shown yet. Decided once, in the render where the card turns
 * confirmed, so that very render already carries the animation.
 */
function useCelebration(messageId: string, confirmed: boolean) {
  const confirmedAtMount = useRef(confirmed);
  const decision = useRef<boolean | null>(null);
  if (confirmed && decision.current === null) {
    decision.current = !confirmedAtMount.current && !readSeen().includes(messageId);
  }
  useEffect(() => {
    if (confirmed) markSeen(messageId);
  }, [confirmed, messageId]);
  return decision.current === true;
}

// The pending details leave instantly unless this is the live moment.
const pendingExit = {
  exit: (animate: boolean) =>
    animate
      ? { opacity: 0, height: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const } }
      : { opacity: 0, transition: { duration: 0 } },
};

/**
 * Official payment details, rendered only from a structured payment message
 * (never from text that merely looks like a number). There is no "Open
 * GCash" button: GCash publishes no supported link to pre-fill a transfer.
 *
 * Once an admin confirms the money arrived (0027) the card turns into a
 * quiet green "Payment Received" state; the original details stay one tap
 * away under "View payment details".
 */
export function PaymentCard({
  card,
  orderNumber,
  messageId,
  received = null,
}: {
  card: PaymentCardData;
  orderNumber: string;
  messageId: string;
  received?: PaymentReceived | null;
}) {
  const actions = useContext(PaymentConfirmContext);
  const reduceMotion = useReducedMotion();
  const confirmed = Boolean(received);
  const celebrate = useCelebration(messageId, confirmed);
  const animate = celebrate && !reduceMotion;
  const canConfirm = !confirmed && Boolean(actions?.confirmableIds.has(messageId));

  return (
    <div
      data-payment-state={confirmed ? "received" : "pending"}
      className={cn(
        "bg-background text-foreground w-full max-w-sm overflow-hidden rounded-2xl border shadow-sm transition-colors duration-500",
        confirmed ? "border-emerald-600/25 dark:border-emerald-400/25" : "border-primary/20",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 transition-colors duration-500",
          confirmed ? "bg-emerald-500/10" : "bg-primary/10",
        )}
      >
        <Wallet className={cn("size-4", confirmed ? "text-emerald-700 dark:text-emerald-300" : "text-primary")} />
        <p
          className={cn(
            "text-xs font-bold tracking-wide uppercase",
            confirmed ? "text-emerald-800 dark:text-emerald-200" : "text-primary",
          )}
        >
          {card.label} Payment
        </p>
        {card.orderNumber && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold [font-variant-numeric:tabular-nums]",
              confirmed ? "bg-emerald-600/10 text-emerald-800 dark:text-emerald-200" : "bg-primary/10 text-primary",
            )}
            data-testid="payment-order"
          >
            For {card.orderNumber}
          </span>
        )}
      </div>

      <AnimatePresence initial={false} mode="wait" custom={animate}>
        {confirmed && received ? (
          <motion.div
            key="received"
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: animate ? 0.2 : 0 }}
          >
            <ReceivedBody
              card={card}
              orderNumber={orderNumber}
              messageId={messageId}
              received={received}
              animate={animate}
              confirmedByName={actions ? actions.nameFor(received.confirmedBy) : null}
              adminView={Boolean(actions)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="pending"
            className="overflow-hidden"
            // The number fades and collapses out of the way of the checkmark.
            variants={pendingExit}
            custom={animate}
            exit="exit"
          >
            <PaymentDetails card={card} orderNumber={orderNumber} messageId={messageId} />
            {canConfirm && actions && (
              <div className="border-border/60 border-t p-3">
                <ConfirmPaymentButton card={card} onConfirm={() => actions.confirm(messageId)} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReceivedBody({
  card,
  orderNumber,
  messageId,
  received,
  animate,
  confirmedByName,
  adminView,
}: {
  card: PaymentCardData;
  orderNumber: string;
  messageId: string;
  received: PaymentReceived;
  animate: boolean;
  confirmedByName: string | null;
  adminView: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  return (
    <div>
      <div role="status" className="flex flex-col items-center px-4 pt-5 pb-4 text-center">
        <motion.div
          initial={animate ? { scale: 0.6, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
          className="flex size-12 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={animate ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, delay: 0.1, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        </motion.div>
        <p className="font-heading mt-3 text-base font-bold text-emerald-800 dark:text-emerald-200" data-testid="payment-received">
          Payment Received ✓
        </p>
        <p className="text-muted-foreground mt-1 text-sm leading-snug">
          {adminView
            ? `Confirmed by ${confirmedByName ?? "an admin"} · ${WHEN.format(new Date(received.confirmedAt))}`
            : "Your payment has been verified by BudgetWise."}
        </p>
        <p className="mt-2 text-sm font-semibold [font-variant-numeric:tabular-nums]">{formatPaymentAmount(card.amount)}</p>
      </div>

      <div className="border-border/60 border-t">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="text-muted-foreground hover:text-foreground flex min-h-10 w-full items-center justify-center gap-1 px-4 text-xs font-semibold"
        >
          View payment details
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              key="details"
              initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-hidden"
            >
              <PaymentDetails card={card} orderNumber={orderNumber} messageId={messageId} compact />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PaymentDetails({
  card,
  orderNumber,
  messageId,
  compact = false,
}: {
  card: PaymentCardData;
  orderNumber: string;
  messageId: string;
  compact?: boolean;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const qrSrc = `/api/order-chat/${encodeURIComponent(orderNumber)}/payment-qr/${messageId}`;
  const amountText = Number.isInteger(card.amount) ? String(card.amount) : card.amount.toFixed(2);

  return (
    <>
      <dl className={cn("space-y-3 px-4", compact ? "pt-1 pb-3" : "py-3.5")}>
        <div>
          <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Amount</dt>
          <dd
            className={cn(
              "mt-0.5 font-bold tracking-tight [font-variant-numeric:tabular-nums]",
              compact ? "text-base" : "font-heading text-2xl",
            )}
          >
            {formatPaymentAmount(card.amount)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Account Name</dt>
          <dd className="mt-0.5 text-sm font-semibold">{card.accountName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{card.label} Number</dt>
          <dd className="mt-0.5 font-mono text-base font-semibold tracking-wider">{card.accountNumber}</dd>
        </div>
      </dl>
      <div className="border-border/60 grid grid-cols-2 gap-2 border-t p-3">
        <CopyButton value={card.accountNumber} label="Copy Number" />
        <CopyButton value={amountText} label="Copy Amount" />
        {card.hasQr && (
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="border-border bg-background hover:bg-muted col-span-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold"
          >
            <QrCode className="size-3.5" />
            View QR
          </button>
        )}
      </div>
      {card.hasQr && (
        <ImageLightbox src={qrOpen ? qrSrc : null} alt={`${card.label} QR code`} open={qrOpen} onOpenChange={setQrOpen} />
      )}
    </>
  );
}

/**
 * Deliberate two-step confirmation. Confirming is idempotent on the server,
 * so a retry after a dropped connection can never record it twice.
 */
function ConfirmPaymentButton({ card, onConfirm }: { card: PaymentCardData; onConfirm: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      if (await onConfirm()) setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-600/30 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-200"
        >
          <BadgeCheck className="size-4" />
          Confirm Payment Received
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="bg-background fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="font-heading text-lg font-semibold">Confirm payment received?</DialogPrimitive.Title>
            <DialogPrimitive.Close className="hover:bg-muted rounded-full p-1.5 disabled:opacity-50" aria-label="Close" disabled={busy}>
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Only confirm after checking the BudgetWise {card.label} account: {formatPaymentAmount(card.amount)} to{" "}
            <span className="text-foreground font-mono font-semibold">{card.accountNumber}</span> has arrived. A receipt or
            screenshot alone is not proof. The customer sees &ldquo;Payment Received&rdquo; right away, and this cannot be undone.
          </DialogPrimitive.Description>
          <p className="text-muted-foreground mt-2 text-xs">This does not change the XOB order status.</p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close
              disabled={busy}
              className="border-border hover:bg-muted inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-70"
            >
              <BadgeCheck className="size-4" />
              {busy ? "Confirming…" : "Yes, payment received"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
