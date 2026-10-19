"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PaymentCard } from "@/components/chat/payment-card";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import { fetchJson, jsonInit, newClientId, RequestError } from "@/lib/chat/client/fetch-json";
import { parseQuoteAmount } from "@/lib/chat/payment-quote.mjs";
import { formatPaymentAmount, formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** 0033: an order in the customer conversation the card can be for. */
export interface PaymentTargetOrder {
  orderNumber: string;
  total: number;
  paymentState: "awaiting" | "sent" | "received";
}

const PAYMENT_STATE_TEXT: Record<PaymentTargetOrder["paymentState"], string> = {
  awaiting: "Not sent",
  sent: "Sent · awaiting",
  received: "Paid ✓",
};

/**
 * Preview then send the official payment details. The preview shows what
 * the database will send: the stored account and the amount.
 *   order    the amount is the order total (the server decides it).
 *   inquiry  (0031) no order exists, so the admin types the price they
 *            quoted; the customer sees exactly that amount.
 *            0033: in a customer conversation with orders, the admin first
 *            picks WHAT the card is for — one order (amount = that order's
 *            total, the card is tagged with it) or a custom quote.
 * One client id per request (opening + amount + account), so double-clicking
 * Send or retrying after a dropped connection creates one message.
 */
export function PaymentDetailsDialog({
  orderNumber,
  total,
  alreadySent,
  onSent,
  mode = "order",
  orders = [],
}: {
  orderNumber: string;
  total: number;
  alreadySent: boolean;
  onSent: (message: ChatMessageDto) => void;
  mode?: "order" | "inquiry";
  /** 0033: orders in this customer conversation (newest first). */
  orders?: PaymentTargetOrder[];
}) {
  const { paymentMethods } = useInbox();
  const [open, setOpen] = useState(false);
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [amountText, setAmountText] = useState("");
  // "quote" or an order number. Opens on the newest order still without
  // payment details (else the newest order); a conversation with no order
  // can only send a quote.
  const [target, setTarget] = useState<string>("quote");
  const chooseTarget = mode === "inquiry" && orders.length > 0;
  const targetOrder = chooseTarget ? (orders.find((order) => order.orderNumber === target) ?? null) : null;
  const isQuote = mode === "inquiry" && !targetOrder;
  const quoted = isQuote ? parseQuoteAmount(amountText) : null;
  const amount = isQuote ? quoted : targetOrder ? targetOrder.total : total;
  // A different amount, account or order is a different request: new client id.
  const clientMessageId = useMemo(
    () => (open ? newClientId() : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, isQuote ? quoted : null, isQuote || targetOrder ? methodId : null, targetOrder?.orderNumber ?? null],
  );
  const onOpenChange = (next: boolean) => {
    if (next && chooseTarget) {
      setTarget((orders.find((order) => order.paymentState === "awaiting") ?? orders[0]).orderNumber);
    }
    setOpen(next);
  };
  const subjectAlreadySent = targetOrder ? targetOrder.paymentState !== "awaiting" : chooseTarget ? false : alreadySent;
  const method = paymentMethods.find((item) => item.id === methodId) ?? null;

  useEffect(() => {
    if (!methodId && paymentMethods[0]) setMethodId(paymentMethods[0].id);
  }, [methodId, paymentMethods]);

  async function send() {
    if (!method || sending || amount === null) return;
    setSending(true);
    try {
      const body = await fetchJson<{ message: ChatMessageDto }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/payment-details`,
        jsonInit(
          "POST",
          targetOrder
            ? { methodId: method.id, clientMessageId, orderRef: targetOrder.orderNumber }
            : isQuote
              ? { methodId: method.id, clientMessageId, amount }
              : { methodId: method.id, clientMessageId },
        ),
      );
      onSent(body.message);
      setOpen(false);
      setAmountText("");
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "Could not send payment details.");
    } finally {
      setSending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-10 shrink-0 gap-1.5 rounded-lg px-3 text-xs" aria-label="Send payment details" title="Send payment details">
          <Wallet className="size-4" />
          <span>Payment</span>
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="bg-background fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="font-heading text-lg font-semibold">Send payment details</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                {chooseTarget
                  ? "Choose what this payment is for. Each order keeps its own payment card."
                  : isQuote
                    ? "Enter the price you quoted. The customer sees exactly this amount on the card."
                    : "The customer will see this card. The amount is the order total."}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="hover:bg-muted rounded-full p-1.5" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {paymentMethods.length === 0 ? (
            <p className="mt-4 text-sm">
              No active payment account yet.{" "}
              <Link href="/admin/payment-settings" className="text-primary font-semibold underline">
                Set one up
              </Link>
              .
            </p>
          ) : (
            <>
              {paymentMethods.length > 1 && (
                <select
                  value={methodId}
                  onChange={(event) => setMethodId(event.target.value)}
                  className="border-input mt-4 h-10 w-full rounded-lg border px-2 text-sm"
                >
                  {paymentMethods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · {item.accountName} · {item.accountNumber}
                    </option>
                  ))}
                </select>
              )}
              {chooseTarget && (
                <fieldset className="mt-4" data-testid="payment-target">
                  <legend className="text-sm font-semibold">Payment for</legend>
                  <div role="radiogroup" className="mt-1.5 grid max-h-52 gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
                    {orders.map((order) => (
                      <TargetOption
                        key={order.orderNumber}
                        selected={target === order.orderNumber}
                        onSelect={() => setTarget(order.orderNumber)}
                        title={`Order ${order.orderNumber}`}
                        detail={formatPrice(order.total)}
                        chip={PAYMENT_STATE_TEXT[order.paymentState]}
                        chipTone={order.paymentState}
                      />
                    ))}
                    <TargetOption
                      selected={target === "quote"}
                      onSelect={() => setTarget("quote")}
                      title="Custom quote"
                      detail="Not tied to an order (e.g. an item not in the catalog)"
                    />
                  </div>
                </fieldset>
              )}
              {isQuote && (
                <label className="mt-4 block">
                  <span className="text-sm font-semibold">Amount to pay (PHP)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value)}
                    placeholder="e.g. 499.50"
                    aria-invalid={amountText.trim() !== "" && quoted === null}
                    className="border-input focus-visible:ring-ring/40 mt-1 h-11 w-full rounded-lg border px-3 text-base font-semibold outline-none focus-visible:ring-3 [font-variant-numeric:tabular-nums]"
                    data-testid="quote-amount"
                  />
                  {amountText.trim() !== "" && quoted === null && (
                    <span className="text-destructive mt-1 block text-xs">Enter an amount from ₱0.01 to ₱1,000,000 (up to 2 decimals).</span>
                  )}
                </label>
              )}
              {method && amount !== null && (
                <div className="mt-4 flex justify-center">
                  <PaymentCard
                    card={{
                      provider: method.provider,
                      label: method.label,
                      accountName: method.accountName,
                      accountNumber: method.accountNumber,
                      amount,
                      currency: "PHP",
                      hasQr: false,
                      orderNumber: targetOrder?.orderNumber ?? null,
                    }}
                    orderNumber={targetOrder?.orderNumber ?? orderNumber}
                    messageId=""
                  />
                </div>
              )}
              {method?.hasQr && <p className="text-muted-foreground mt-2 text-center text-xs">The customer will also get a “View QR” button.</p>}
              {subjectAlreadySent && (
                <p className="mt-3 rounded-lg bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                  {targetOrder
                    ? `Payment details were already sent for ${targetOrder.orderNumber}. Sending again posts a new card for this order; only its newest card can be confirmed.`
                    : "Payment details were already sent in this chat. Sending again posts another card; only the newest can be confirmed."}
                </p>
              )}
              <Button type="button" className="mt-4 h-11 w-full" disabled={!method || sending || amount === null} onClick={() => void send()}>
                {sending
                  ? "Sending…"
                  : targetOrder
                    ? `Send ${formatPaymentAmount(targetOrder.total)} for ${targetOrder.orderNumber}`
                    : isQuote && amount !== null
                      ? `Send ${formatPaymentAmount(amount)} to customer`
                      : "Send to customer"}
              </Button>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TargetOption({
  selected,
  onSelect,
  title,
  detail,
  chip,
  chipTone,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  chip?: string;
  chipTone?: PaymentTargetOrder["paymentState"];
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-[border-color,background-color] duration-150",
        selected ? "border-primary bg-primary/[0.06] ring-primary/20 ring-2" : "border-border hover:bg-muted/60",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
        aria-hidden
      >
        {selected && <span className="bg-primary size-2 rounded-full" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold [font-variant-numeric:tabular-nums]">{title}</span>
        <span className="text-muted-foreground block truncate text-xs">{detail}</span>
      </span>
      {chip && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
            chipTone === "received"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : chipTone === "sent"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
          )}
        >
          {chip}
        </span>
      )}
    </button>
  );
}
