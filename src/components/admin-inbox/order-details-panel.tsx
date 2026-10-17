"use client";

import { useState } from "react";
import { CheckCircle2, Clock, ExternalLink, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { OrderDetails, OrderDetailsLine } from "@/lib/chat/order-details.mjs";
import type { FulfillmentSlotView } from "@/lib/chat/fulfillment-fields.mjs";
import { CopyButton } from "@/components/chat/copy-button";
import { OrderStatusBadge } from "@/components/order-chat/order-status-badge";
import { AssignmentControl } from "@/components/admin-inbox/assignment-control";
import { formatPrice } from "@/lib/pricing";
import { fetchJson, jsonInit, RequestError } from "@/lib/chat/client/fetch-json";

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
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
        {loading ? <Loader2 className="size-5 animate-spin" /> : "Order details unavailable."}
      </div>
    );
  }

  const { order, customer, viaPlus, groups } = details;

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
      <div className="flex justify-between gap-2 text-sm">
        <span className="min-w-0 font-semibold">
          {line.quantity > 1 && <span className="text-primary">{line.quantity}× </span>}
          {line.productName}
        </span>
        <span className="shrink-0 font-semibold">{formatPrice(line.lineTotal)}</span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {line.robuxAmount.toLocaleString()} Robux{line.quantity > 1 ? ` each · ${line.totalRobux.toLocaleString()} total` : ""} ·{" "}
        {formatPrice(line.unitPrice)} each
      </p>
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
