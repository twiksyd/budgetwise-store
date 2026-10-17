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

/**
 * Preview then send the official payment details. The preview shows what
 * the database will send: the stored account and the order total (the
 * server, not this dialog, decides the amount). One client id per opening,
 * so double-clicking Send creates one message.
 */
export function PaymentDetailsDialog({
  orderNumber,
  total,
  alreadySent,
  onSent,
}: {
  orderNumber: string;
  total: number;
  alreadySent: boolean;
  onSent: (message: ChatMessageDto) => void;
}) {
  const { paymentMethods } = useInbox();
  const [open, setOpen] = useState(false);
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const clientMessageId = useMemo(() => (open ? newClientId() : ""), [open]);
  const method = paymentMethods.find((item) => item.id === methodId) ?? null;

  useEffect(() => {
    if (!methodId && paymentMethods[0]) setMethodId(paymentMethods[0].id);
  }, [methodId, paymentMethods]);

  async function send() {
    if (!method || sending) return;
    setSending(true);
    try {
      const body = await fetchJson<{ message: ChatMessageDto }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/payment-details`,
        jsonInit("POST", { methodId: method.id, clientMessageId }),
      );
      onSent(body.message);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "Could not send payment details.");
    } finally {
      setSending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-full" aria-label="Send payment details" title="Send payment details">
          <Wallet className="size-4" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="bg-background fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="font-heading text-lg font-semibold">Send payment details</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                The customer will see this card. The amount is the order total.
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
              {method && (
                <div className="mt-4 flex justify-center">
                  <PaymentCard
                    card={{
                      provider: method.provider,
                      label: method.label,
                      accountName: method.accountName,
                      accountNumber: method.accountNumber,
                      amount: total,
                      currency: "PHP",
                      hasQr: false,
                    }}
                    orderNumber={orderNumber}
                    messageId=""
                  />
                </div>
              )}
              {method?.hasQr && <p className="text-muted-foreground mt-2 text-center text-xs">The customer will also get a “View QR” button.</p>}
              {alreadySent && (
                <p className="mt-3 rounded-lg bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900 dark:text-amber-200">
                  Payment details were already sent for this order. Sending again posts another card.
                </p>
              )}
              <Button type="button" className="mt-4 h-11 w-full" disabled={!method || sending} onClick={() => void send()}>
                {sending ? "Sending…" : "Send to customer"}
              </Button>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
