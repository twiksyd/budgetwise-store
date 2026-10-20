"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Link2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/chat/copy-button";
import { Taglish } from "@/components/shared/taglish";
import { fetchJson, jsonInit, RequestError } from "@/lib/chat/client/fetch-json";
import { parseRobloxGamepassUrl } from "@/lib/chat/gamepass-url.mjs";

export interface CustomerSlot {
  lineIndex: number;
  unitIndex: number;
  unitCount: number;
  fieldKey: string;
  label: string;
  status: "provided" | "waiting";
  value: string | null;
  productName: string;
  gameName: string;
}

/**
 * Structured place for the customer's gamepass link(s) — saved to the order,
 * not sent as a chat message, so staff see it in the order panel without
 * scrolling the conversation.
 */
export function GamepassLinkCard({
  orderNumber,
  slots,
  onSlotsChange,
}: {
  orderNumber: string;
  slots: CustomerSlot[];
  onSlotsChange: (slots: CustomerSlot[]) => void;
}) {
  if (slots.length === 0) return null;
  const waiting = slots.filter((slot) => slot.status === "waiting").length;
  const needsSeveral = slots.length > 1;

  // One group per order line; a line bought several times gets one numbered
  // field per unit ("Gamepass Link 1", "Gamepass Link 2", ...).
  const lines: CustomerSlot[][] = [];
  for (const slot of slots) {
    const group = lines.find((items) => items[0].lineIndex === slot.lineIndex);
    if (group) group.push(slot);
    else lines.push([slot]);
  }

  return (
    <section className="surface-premium rounded-xl p-4 sm:p-5" aria-label="Gamepass link">
      <div className="flex items-start gap-3">
        <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-full">
          <Link2 className="text-primary size-4" />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold">{needsSeveral ? "Gamepass Links" : "Gamepass Link"}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {waiting === 0
              ? needsSeveral
                ? "All submitted — our team can see them with your order."
                : "Submitted — our team can see it with your order."
              : needsSeveral
                ? `We need ${slots.length} gamepass links for this order — one for each item. Paste each link in its own box.`
                : "Paste the link to the Roblox gamepass you created for this order."}
          </p>
          {waiting > 0 && (
            <Taglish>
              {needsSeveral
                ? `Kailangan namin ng ${slots.length} gamepass link — isa bawat item. I-paste ang bawat link sa sarili niyang box.`
                : "I-paste dito ang link ng gamepass na ginawa mo. Makikita agad ito ng team namin."}
            </Taglish>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {lines.map((group) => (
          <div key={group[0].lineIndex} className="space-y-2">
            {(lines.length > 1 || group[0].unitCount > 1) && (
              <p className="text-muted-foreground text-xs font-semibold">
                {group[0].productName}
                {group[0].unitCount > 1 && ` × ${group[0].unitCount}`}
              </p>
            )}
            {group.map((slot) => (
              <SlotRow key={`${slot.lineIndex}-${slot.unitIndex}`} orderNumber={orderNumber} slot={slot} onSlotsChange={onSlotsChange} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function SlotRow({
  orderNumber,
  slot,
  onSlotsChange,
}: {
  orderNumber: string;
  slot: CustomerSlot;
  onSlotsChange: (slots: CustomerSlot[]) => void;
}) {
  const [editing, setEditing] = useState(slot.status === "waiting");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const title = slot.unitCount > 1 ? `Gamepass Link ${slot.unitIndex + 1}` : "Gamepass Link";
  const inputId = `gamepass-${slot.lineIndex}-${slot.unitIndex}`;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseRobloxGamepassUrl(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = await fetchJson<{ slots: CustomerSlot[] }>(
        `/api/order-chat/${encodeURIComponent(orderNumber)}/fulfillment`,
        jsonInit("PUT", { lineIndex: slot.lineIndex, unitIndex: slot.unitIndex, fieldKey: slot.fieldKey, value }),
      );
      onSlotsChange(body.slots);
      setEditing(false);
      setValue("");
      toast.success("Gamepass link saved.");
    } catch (caught) {
      setError(caught instanceof RequestError ? caught.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="group" aria-label={title} className="border-border/60 bg-background rounded-xl border p-3">
      {editing || !slot.value ? (
        <label htmlFor={inputId} className="text-xs font-semibold">
          {title}
        </label>
      ) : (
        <p className="text-xs font-semibold">{title}</p>
      )}
      {!editing && slot.value ? (
        <div className="mt-2">
          <p className="text-primary inline-flex items-center gap-1 text-xs font-semibold">
            <CheckCircle2 className="size-3.5" /> Submitted
          </p>
          <p className="mt-1 font-mono text-xs break-all">{slot.value}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyButton value={slot.value} />
            <a href={slot.value} target="_blank" rel="noopener noreferrer" className="border-border hover:bg-muted inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold">
              <ExternalLink className="size-3.5" /> Open
            </a>
            <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center gap-1 px-1.5 text-xs font-semibold">
              <Pencil className="size-3" /> Change
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={save} className="mt-2 space-y-2">
          <input
            id={inputId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode="url"
            autoComplete="off"
            placeholder="https://www.roblox.com/game-pass/123456789"
            aria-invalid={Boolean(error)}
            className="border-input bg-muted/30 h-11 w-full rounded-lg border px-3 text-base sm:text-sm"
          />
          {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !value.trim()} className="h-10">
              {saving ? "Saving…" : "Save link"}
            </Button>
            {slot.value && (
              <Button type="button" variant="ghost" className="h-10" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
