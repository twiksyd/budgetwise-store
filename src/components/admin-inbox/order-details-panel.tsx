"use client";

import { useState } from "react";
import { BadgeCheck, CheckCircle2, ChevronDown, Clock, ExternalLink, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { OrderDetails, OrderDetailsLine } from "@/lib/chat/order-details.mjs";
import type { FulfillmentSlotView } from "@/lib/chat/fulfillment-fields.mjs";
import { CopyButton } from "@/components/chat/copy-button";
import { OrderStatusBadge } from "@/components/order-chat/order-status-badge";
import { AssignmentControl } from "@/components/admin-inbox/assignment-control";
import { formatPrice } from "@/lib/pricing";
import { fetchJson, jsonInit, RequestError } from "@/lib/chat/client/fetch-json";
import { cn } from "@/lib/utils";

const DATE_TIME = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border/60 border-b px-4 py-4">
      <h3 className="text-muted-foreground mb-2.5 text-[11px] font-bold tracking-wider uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, copy }: { label: string; value: React.ReactNode; copy?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px]">{label}</p>
        <div className="text-sm font-semibold break-words">{value}</div>
      </div>
      {copy && <CopyButton value={copy} iconOnly label={`Copy ${label}`} className="mt-1 min-h-8 px-2" />}
    </div>
  );
}

/**
 * Right panel. Every value comes from the order records via
 * /api/admin/orders/<n>/details — nothing is parsed from chat.
 */
export function OrderDetailsPanel({
  orderNumber,
  details,
  loading,
  assignedAdminId,
  onDetailsChange,
}: {
  orderNumber: string;
  details: OrderDetails | null;
  loading: boolean;
  assignedAdminId: string | null;
  onDetailsChange: (details: OrderDetails) => void;
}) {
  if (!details) {
    return loading ? (
      <div className="space-y-5 px-4 py-4" aria-busy="true" aria-label="Loading order details">
        {[3, 3, 4].map((rows, section) => (
          <div key={section} className="space-y-2.5">
            <div className="bg-muted h-3 w-16 animate-pulse rounded" />
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="bg-muted h-4 animate-pulse rounded" style={{ width: `${85 - index * 12}%` }} />
            ))}
          </div>
        ))}
      </div>
    ) : (
      <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">Order details unavailable.</div>
    );
  }

  const { order, customer, viaPlus, groups } = details;

  // A General Inquiry (0026): who is asking and who is assisting. Since 0033
  // it is the customer's one ongoing conversation: every order placed since
  // is listed below, each with its own items, details and payment state.
  if (details.kind === "inquiry") {
    const orders = details.orders ?? [];
    const orderCount = details.orderCount ?? orders.length;
    const replaceOrder = (updated: OrderDetails) =>
      onDetailsChange({
        ...details,
        orders: orders.map((item) =>
          item.order.orderNumber === updated.order.orderNumber
            ? {
                ...updated,
                order: {
                  ...updated.order,
                  paymentState: item.order.paymentState,
                  paymentDetailsSentAt: item.order.paymentDetailsSentAt,
                },
              }
            : item,
        ),
      });
    return (
      <div className="text-foreground" data-testid="inquiry-details">
        <Section title={orderCount > 0 ? "Customer conversation" : "General Inquiry"}>
          <p className="text-muted-foreground pb-1 text-xs">
            {orderCount > 0
              ? "Questions and every order from this customer, in one chat."
              : "A question that is not about one order."}
          </p>
          <Field label="Started" value={<span suppressHydrationWarning>{DATE_TIME.format(new Date(order.createdAt))}</span>} />
          <div className="py-1">
            <p className="text-muted-foreground mb-1 text-[11px]">Assigned to</p>
            <AssignmentControl orderNumber={orderNumber} assignedAdminId={assignedAdminId} />
          </div>
        </Section>
        <Section title="Customer">
          <Field label="Name" value={customer.name} copy={customer.name} />
          {customer.robloxUsername && (
            <Field label="Roblox username (latest order)" value={customer.robloxUsername} copy={customer.robloxUsername} />
          )}
          {customer.email && <Field label="Google account (internal)" value={customer.email} />}
        </Section>
        {orders.length > 0 && (
          <Section title={`Orders (${orderCount})`}>
            <div className="space-y-2" data-testid="conversation-orders-panel">
              {orders.map((item, index) => (
                <ConversationOrder key={item.order.orderNumber} details={item} defaultOpen={index === 0} onDetailsChange={replaceOrder} />
              ))}
            </div>
            {orderCount > orders.length && (
              <p className="text-muted-foreground mt-2 text-[11px]">
                Showing the latest {orders.length}. Search the inbox by order number to find older ones.
              </p>
            )}
          </Section>
        )}
      </div>
    );
  }

  return (
    <div className="text-foreground">
      <Section title="Order">
        <Field label="Order number" value={order.orderNumber} copy={order.orderNumber} />
        <Field label="Ordered" value={<span suppressHydrationWarning>{DATE_TIME.format(new Date(order.createdAt))}</span>} />
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-muted-foreground text-[11px]">Status (from XOB)</p>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[11px]">Total</p>
            <p className="font-heading text-lg font-bold">{formatPrice(order.total)}</p>
          </div>
        </div>
        <div className="py-1">
          <p className="text-muted-foreground mb-1 text-[11px]">Assigned to</p>
          <AssignmentControl orderNumber={orderNumber} assignedAdminId={assignedAdminId} />
        </div>
        <p className="text-muted-foreground mt-1 text-[11px]">
          Payment details: {order.paymentDetailsSentAt ? "sent" : "not sent yet"}
        </p>
      </Section>

      <Section title="Customer">
        <Field label="Name" value={customer.name} copy={customer.name} />
        <Field label="Roblox username" value={customer.robloxUsername} copy={customer.robloxUsername} />
        {customer.email && <Field label="Google account (internal)" value={customer.email} />}
      </Section>

      <Section title="Items">
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.gameName}>
              <p className="text-sm font-bold">{group.gameName}</p>
              <ul className="mt-1.5 space-y-2">
                {group.lines.map((line) => (
                  <LineItem key={line.lineIndex} line={line} orderNumber={orderNumber} onDetailsChange={onDetailsChange} />
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-border/60 mt-3 flex justify-between border-t pt-3">
          <span className="text-sm font-bold">TOTAL</span>
          <span className="font-heading text-base font-bold">{formatPrice(order.total)}</span>
        </div>
      </Section>

      {viaPlus && (
        <Section title="Robux Via Plus">
          <Field label="Roblox display name" value={viaPlus.robloxDisplayName} copy={viaPlus.robloxDisplayName} />
          <Field label="Robux" value={viaPlus.robuxAmount.toLocaleString()} />
          <p className="text-muted-foreground mt-1 text-xs">
            Age 16+: {viaPlus.age16Confirmed ? "confirmed" : "no"} · Verified: {viaPlus.verifiedAccountConfirmed ? "confirmed" : "no"}
          </p>
        </Section>
      )}
    </div>
  );
}

function LineItem({
  line,
  orderNumber,
  onDetailsChange,
}: {
  line: OrderDetailsLine;
  orderNumber: string;
  onDetailsChange: (details: OrderDetails) => void;
}) {
  return (
    <li className="bg-muted/40 rounded-xl p-2.5">
      <div className="flex gap-2.5">
        <ProductThumb src={line.imageUrl} name={line.productName} />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="min-w-0 font-semibold">{line.productName}</span>
            <span className="shrink-0 font-semibold">{formatPrice(line.lineTotal)}</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {line.robuxAmount.toLocaleString()} Robux{line.quantity > 1 ? ` each · ${line.totalRobux.toLocaleString()} total` : ""}
          </p>
          <p className="text-muted-foreground text-xs">
            <span className={line.quantity > 1 ? "text-primary font-semibold" : ""}>Qty {line.quantity}</span> ·{" "}
            {formatPrice(line.unitPrice)} each
          </p>
        </div>
      </div>
      {line.fulfillment.map((slot) => (
        <FulfillmentSlot
          key={`${slot.unitIndex}-${slot.fieldKey}`}
          slot={slot}
          orderNumber={orderNumber}
          onDetailsChange={onDetailsChange}
        />
      ))}
    </li>
  );
}

function FulfillmentSlot({
  slot,
  orderNumber,
  onDetailsChange,
}: {
  slot: FulfillmentSlotView;
  orderNumber: string;
  onDetailsChange: (details: OrderDetails) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slot.value ?? "");
  const [saving, setSaving] = useState(false);
  const label = slot.unitCount > 1 ? `${slot.label} ${slot.unitIndex + 1} of ${slot.unitCount}` : slot.label;

  async function save() {
    setSaving(true);
    try {
      const body = await fetchJson<{ details: OrderDetails }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/fulfillment`,
        jsonInit("PUT", { lineIndex: slot.lineIndex, unitIndex: slot.unitIndex, fieldKey: slot.fieldKey, value: draft }),
      );
      onDetailsChange(body.details);
      setEditing(false);
      toast.success("Corrected. The change is recorded in the audit log.");
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border/60 bg-background mt-2 rounded-lg border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold">{label}</p>
        {slot.status === "provided" ? (
          <span className="text-primary inline-flex items-center gap-1 text-[10px] font-semibold">
            <CheckCircle2 className="size-3" /> {slot.source === "admin" ? "Set by admin" : "From customer"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
            <Clock className="size-3" /> Waiting for customer
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="https://www.roblox.com/game-pass/…"
            className="border-input w-full rounded-lg border px-2.5 py-2 text-xs"
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={saving} className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold">
              {saving ? "Saving…" : "Save correction"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
              Cancel
            </button>
          </div>
        </div>
      ) : slot.value ? (
        <div className="mt-1.5">
          <p className="font-mono text-xs break-all">{slot.value}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CopyButton value={slot.value} label="Copy" className="min-h-8" />
            <a
              href={slot.value}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border hover:bg-muted inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold"
            >
              <ExternalLink className="size-3.5" /> Open
            </a>
            <button
              type="button"
              onClick={() => {
                setDraft(slot.value ?? "");
                setEditing(true);
              }}
              className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 px-1.5 text-xs font-semibold"
            >
              <Pencil className="size-3" /> Correct
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-muted-foreground hover:text-foreground mt-1.5 inline-flex items-center gap-1 text-xs font-semibold"
        >
          <Pencil className="size-3" /> Enter on customer&apos;s behalf
        </button>
      )}
    </div>
  );
}

/** The catalog's own product artwork (never generated); initials if none. */
export function ProductThumb({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return (
    <div className={`bg-background border-border/60 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${className ?? ""}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="text-muted-foreground text-[10px] font-bold uppercase">{name.slice(0, 2)}</span>
      )}
    </div>
  );
}

const PAYMENT_STATE: Record<"awaiting" | "sent" | "received", { text: string; icon: typeof Clock; tone: string }> = {
  awaiting: { text: "Payment not sent", icon: Clock, tone: "bg-muted text-muted-foreground" },
  sent: { text: "Awaiting payment", icon: Wallet, tone: "bg-primary/10 text-primary" },
  received: { text: "Paid ✓", icon: BadgeCheck, tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

/** 0033: one order inside a customer conversation (collapsible). */
function ConversationOrder({
  details,
  defaultOpen,
  onDetailsChange,
}: {
  details: OrderDetails;
  defaultOpen: boolean;
  onDetailsChange: (details: OrderDetails) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { order, viaPlus, groups } = details;
  const payment = PAYMENT_STATE[order.paymentState ?? "awaiting"];
  const PaymentIcon = payment.icon;
  const itemCount = groups.reduce((sum, group) => sum + group.lines.reduce((count, line) => count + line.quantity, 0), 0);
  return (
    <div className="border-border/70 overflow-hidden rounded-xl border" data-panel-order={order.orderNumber}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-muted/50 flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold [font-variant-numeric:tabular-nums]">
            {order.orderNumber}
            {details.fulfillmentPending > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                {details.fulfillmentPending} link{details.fulfillmentPending === 1 ? "" : "s"} missing
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]" suppressHydrationWarning>
            {DATE_TIME.format(new Date(order.createdAt))} · {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <OrderStatusBadge status={order.status} />
            <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", payment.tone)}>
              <PaymentIcon className="size-3" aria-hidden />
              {payment.text}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-heading text-base font-bold">{formatPrice(order.total)}</span>
          <ChevronDown className={cn("text-muted-foreground size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </div>
      </button>
      {open && (
        <div className="border-border/60 border-t px-3 pt-2 pb-3">
          <div className="flex items-center justify-between gap-2 pb-1">
            <p className="text-muted-foreground text-[11px]">Roblox: <span className="text-foreground font-semibold">{details.customer.robloxUsername}</span></p>
            <CopyButton value={order.orderNumber} label="Copy order no." className="min-h-8" />
          </div>
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.gameName}>
                <p className="text-xs font-bold">{group.gameName}</p>
                <ul className="mt-1.5 space-y-2">
                  {group.lines.map((line) => (
                    <LineItem key={line.lineIndex} line={line} orderNumber={order.orderNumber} onDetailsChange={onDetailsChange} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {viaPlus && (
            <p className="text-muted-foreground mt-2 text-xs">
              Via Plus · {viaPlus.robloxDisplayName} · {viaPlus.robuxAmount.toLocaleString()} Robux · Age 16+:{" "}
              {viaPlus.age16Confirmed ? "confirmed" : "no"} · Verified: {viaPlus.verifiedAccountConfirmed ? "confirmed" : "no"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
