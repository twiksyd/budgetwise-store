"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { OrderSummary } from "@/components/checkout/order-summary";
import { OrderingProgress } from "@/components/ordering/ordering-progress";
import {
  useCartStore,
  useCartHydrated,
  selectCartSubtotal,
} from "@/stores/cart-store";
import { formatPrice } from "@/lib/pricing";
import type { CartItem } from "@/types/domain";

type CatalogItem =
  | { gamepassId: string; listed: false; available: false }
  | { gamepassId: string; listed: true; available: boolean; name: string; price: number; robuxAmount: number };

interface CatalogChanges {
  prices: { gamepassId: string; name: string; from: number; to: number }[];
  unavailable: { gamepassId: string; name: string }[];
}

/**
 * Before the customer submits: re-read the items' CURRENT catalog values
 * (an in-chat product card, or a cart left open for days, may be stale).
 * Changed prices are applied to the cart and called out; items no longer
 * orderable are listed with a one-tap remove. The order API still prices
 * everything on the server — this is so nothing surprises the customer.
 */
function useCatalogRevalidation(hydrated: boolean) {
  const [changes, setChanges] = useState<CatalogChanges | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!hydrated || started.current) return;
    const items = useCartStore.getState().items;
    if (items.length === 0) return;
    started.current = true;
    const controller = new AbortController();
    const ids = items.map((item) => item.gamepassId).join(",");
    fetch(`/api/catalog/items?ids=${encodeURIComponent(ids)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ items: CatalogItem[] }>) : null))
      .then((body) => {
        if (!body) return;
        const current = useCartStore.getState().items;
        const byId = new Map(current.map((item) => [item.gamepassId, item] as const));
        const prices: CatalogChanges["prices"] = [];
        const unavailable: CatalogChanges["unavailable"] = [];
        const updates: { gamepassId: string; name: string; price: number; robuxAmount: number }[] = [];
        for (const entry of body.items) {
          const item: CartItem | undefined = byId.get(entry.gamepassId);
          if (!item) continue;
          if (!entry.listed || !entry.available) {
            unavailable.push({ gamepassId: item.gamepassId, name: entry.listed ? entry.name : item.name });
          }
          if (entry.listed) {
            if (Math.abs(entry.price - item.price) >= 0.005) {
              prices.push({ gamepassId: item.gamepassId, name: entry.name, from: item.price, to: entry.price });
            }
            updates.push({ gamepassId: item.gamepassId, name: entry.name, price: entry.price, robuxAmount: entry.robuxAmount });
          }
        }
        useCartStore.getState().syncCatalog(updates);
        if (prices.length || unavailable.length) setChanges({ prices, unavailable });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [hydrated]);
  return { changes, dismiss: () => setChanges(null) };
}

function CatalogChangesNotice({ changes, onDismiss }: { changes: CatalogChanges; onDismiss: () => void }) {
  const removeItem = useCartStore((state) => state.removeItem);
  const inCart = useCartStore((state) => state.items);
  const unavailable = changes.unavailable.filter((entry) => inCart.some((item) => item.gamepassId === entry.gamepassId));
  if (changes.prices.length === 0 && unavailable.length === 0) return null;
  return (
    <div
      className="bw-card-in mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-50"
      role="status"
      data-testid="catalog-changes"
    >
      <div className="flex items-start gap-2.5">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">We checked the latest prices for you</p>
          {changes.prices.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {changes.prices.map((change) => (
                <li key={change.gamepassId} className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
                  <span className="min-w-0 truncate font-medium">{change.name}</span>
                  <span className="text-amber-900/70 line-through dark:text-amber-100/60">{formatPrice(change.from)}</span>
                  <span className="font-semibold">→ {formatPrice(change.to)}</span>
                </li>
              ))}
            </ul>
          )}
          {unavailable.length > 0 && (
            <div className="mt-2">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <TriangleAlert className="size-3.5" aria-hidden />
                No longer available: {unavailable.map((entry) => entry.name).join(", ")}
              </p>
              <button
                type="button"
                onClick={() => unavailable.forEach((entry) => removeItem(entry.gamepassId))}
                className="mt-2 inline-flex min-h-9 items-center rounded-full bg-amber-950/90 px-3.5 text-xs font-semibold text-amber-50 dark:bg-amber-100 dark:text-amber-950"
              >
                Remove {unavailable.length === 1 ? "it" : "them"} from my order
              </button>
            </div>
          )}
          {changes.prices.length > 0 && <p className="mt-1.5 text-xs opacity-80">Your order total below uses the current prices.</p>}
        </div>
        <button type="button" onClick={onDismiss} className="-m-1 rounded-full p-1.5 hover:bg-amber-500/15" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function CheckoutClient({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const hydrated = useCartHydrated();
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore(selectCartSubtotal);
  const catalog = useCatalogRevalidation(hydrated);

  useEffect(() => {
    if (hydrated && items.length === 0) router.replace("/cart");
  }, [hydrated, items.length, router]);

  if (!hydrated || items.length === 0) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 sm:py-14">
      <OrderingProgress
        currentStep={3}
        compact
        description="Gagamitin namin ito para mahanap ang inyong order at makausap kayo dito mismo sa website."
      />

      <h1 className="font-heading mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        Ilagay ang Tamang Details
      </h1>
      {catalog.changes && <CatalogChangesNotice changes={catalog.changes} onDismiss={catalog.dismiss} />}
      <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] sm:gap-6">
        <div className="surface-premium rounded-2xl p-5 sm:p-6">
          <CheckoutForm defaultName={defaultName} />
        </div>
        <OrderSummary items={items} subtotal={subtotal} />
      </div>
    </div>
  );
}
