"use client";

import { useState } from "react";
import { QrCode, Wallet } from "lucide-react";
import type { PaymentCard as PaymentCardData } from "@/lib/chat/dto.mjs";
import { formatPrice } from "@/lib/pricing";
import { CopyButton } from "@/components/chat/copy-button";
import { ImageLightbox } from "@/components/chat/image-lightbox";

/**
 * Official payment details, rendered only from a structured payment message
 * (never from text that merely looks like a number). There is no "Open
 * GCash" button: GCash publishes no supported link to pre-fill a transfer.
 */
export function PaymentCard({
  card,
  orderNumber,
  messageId,
}: {
  card: PaymentCardData;
  orderNumber: string;
  messageId: string;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const qrSrc = `/api/order-chat/${encodeURIComponent(orderNumber)}/payment-qr/${messageId}`;
  const amountText = Number.isInteger(card.amount) ? String(card.amount) : card.amount.toFixed(2);

  return (
    <div className="border-primary/20 bg-background text-foreground w-full max-w-sm overflow-hidden rounded-2xl border shadow-sm">
      <div className="bg-primary/10 flex items-center gap-2 px-4 py-2.5">
        <Wallet className="text-primary size-4" />
        <p className="text-primary text-xs font-bold tracking-wide uppercase">{card.label} Payment</p>
      </div>
      <dl className="space-y-3 px-4 py-3.5">
        <div>
          <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Amount</dt>
          <dd className="font-heading mt-0.5 text-2xl font-bold tracking-tight [font-variant-numeric:tabular-nums]">
            {formatPrice(card.amount)}
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
    </div>
  );
}
