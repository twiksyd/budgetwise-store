"use client";

import { useState } from "react";
import { Plus, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RequestError } from "@/lib/chat/client/fetch-json";

interface PaymentMethod {
  id: string;
  provider: "gcash";
  label: string;
  accountName: string;
  accountNumber: string;
  hasQr: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export function PaymentSettingsManager({ initialMethods }: { initialMethods: PaymentMethod[] }) {
  const [methods, setMethods] = useState(initialMethods);
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(initialMethods.length === 0 ? "new" : null);

  return (
    <div className="space-y-4">
      {methods.map((method) => (
        <div key={method.id} className="surface-premium flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {method.label} · {method.accountName}
              {!method.isActive && <span className="text-muted-foreground ml-2 text-xs">Inactive</span>}
            </p>
            <p className="font-mono text-sm">{method.accountNumber}</p>
            <p className="text-muted-foreground text-xs">{method.hasQr ? "QR uploaded" : "No QR"}</p>
          </div>
          <div className="flex gap-2">
            {method.hasQr && (
              <a href={`/api/admin/payment-methods/${method.id}/qr`} target="_blank" rel="noopener noreferrer" className="border-border hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold">
                <QrCode className="size-3.5" /> View QR
              </a>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(method)}>Edit</Button>
          </div>
        </div>
      ))}

      {editing ? (
        <PaymentMethodForm
          method={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(method) => {
            setMethods((current) => [...current.filter((item) => item.id !== method.id), method]);
            setEditing(null);
            toast.success("Payment account saved.");
          }}
        />
      ) : (
        <Button type="button" variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add payment account
        </Button>
      )}
    </div>
  );
}

function PaymentMethodForm({
  method,
  onCancel,
  onSaved,
}: {
  method: PaymentMethod | null;
  onCancel: () => void;
  onSaved: (method: PaymentMethod) => void;
}) {
  const [label, setLabel] = useState(method?.label ?? "GCash");
  const [accountName, setAccountName] = useState(method?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(method?.accountNumber ?? "");
  const [isActive, setIsActive] = useState(method?.isActive ?? true);
  const [qr, setQr] = useState<File | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData();
    if (method) form.set("id", method.id);
    form.set("label", label);
    form.set("accountName", accountName);
    form.set("accountNumber", accountNumber);
    form.set("isActive", String(isActive));
    form.set("sortOrder", String(method?.sortOrder ?? 0));
    form.set("removeQr", String(removeQr));
    if (qr) form.set("qr", qr);
    try {
      const response = await fetch("/api/admin/payment-methods", { method: "POST", body: form });
      const body = (await response.json().catch(() => null)) as { method?: PaymentMethod; error?: string } | null;
      if (!response.ok || !body?.method) throw new RequestError(body?.error ?? "Could not save.", response.status);
      onSaved(body.method);
    } catch (caught) {
      setError(caught instanceof RequestError ? caught.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="surface-premium space-y-3 rounded-xl p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold">
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={40} className="border-input mt-1 h-10 w-full rounded-lg border px-2.5 text-sm" />
        </label>
        <label className="block text-xs font-semibold">
          Account name
          <input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={80} required className="border-input mt-1 h-10 w-full rounded-lg border px-2.5 text-sm" />
        </label>
        <label className="block text-xs font-semibold">
          GCash number
          <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} inputMode="numeric" placeholder="09XXXXXXXXX" required className="border-input mt-1 h-10 w-full rounded-lg border px-2.5 font-mono text-sm" />
        </label>
      </div>
      <label className="block text-xs font-semibold">
        Official QR (optional, JPG/PNG/WebP, max 2 MB)
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setQr(event.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
      </label>
      {method?.hasQr && !qr && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={removeQr} onChange={(event) => setRemoveQr(event.target.checked)} className="accent-primary size-4" />
          Remove current QR
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="accent-primary size-4" />
        Active (available in “Send payment details”)
      </label>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
