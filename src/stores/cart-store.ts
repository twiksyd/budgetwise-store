import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  MAX_DISTINCT_ORDER_ITEMS,
  MAX_QUANTITY_PER_PRODUCT,
} from "@/lib/validations/order";
import type { CartItem } from "@/types/domain";

// Mirrors the limits the order API already enforces (see
// src/lib/validations/order.ts) so the cart UI can reject an invalid
// add/increase before the customer ever reaches checkout.
export type CartLimitReason = "MAX_PRODUCTS" | "MAX_QUANTITY";

export interface CartActionResult {
  ok: boolean;
  reason?: CartLimitReason;
}

interface CartState {
  items: CartItem[];
  addItem: (
    item: Omit<CartItem, "quantity">,
    quantity?: number,
  ) => CartActionResult;
  removeItem: (gamepassId: string) => void;
  setQuantity: (gamepassId: string, quantity: number) => CartActionResult;
  removeOrderedItems: (
    orderedItems: { gamepassId: string; quantity: number }[],
  ) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item, quantity = 1) => {
        const state = get();
        const existing = state.items.find(
          (i) => i.gamepassId === item.gamepassId,
        );

        if (!existing && state.items.length >= MAX_DISTINCT_ORDER_ITEMS) {
          return { ok: false, reason: "MAX_PRODUCTS" };
        }

        const currentQuantity = existing?.quantity ?? 0;
        if (currentQuantity >= MAX_QUANTITY_PER_PRODUCT) {
          return { ok: false, reason: "MAX_QUANTITY" };
        }

        const nextQuantity = Math.min(
          currentQuantity + quantity,
          MAX_QUANTITY_PER_PRODUCT,
        );

        set({
          items: existing
            ? state.items.map((i) =>
                i.gamepassId === item.gamepassId
                  ? { ...i, quantity: nextQuantity }
                  : i,
              )
            : [...state.items, { ...item, quantity: nextQuantity }],
        });

        return { ok: true };
      },
      removeItem: (gamepassId) =>
        set((state) => ({
          items: state.items.filter((i) => i.gamepassId !== gamepassId),
        })),
      setQuantity: (gamepassId, quantity) => {
        if (quantity <= 0) {
          set((state) => ({
            items: state.items.filter((i) => i.gamepassId !== gamepassId),
          }));
          return { ok: true };
        }

        const state = get();
        const existing = state.items.find((i) => i.gamepassId === gamepassId);
        // A cart persisted before this cap existed (or before it was
        // lowered) can already hold a line above it. Only block requests
        // that would INCREASE past the cap — a customer reducing 54 down
        // toward 50 passes through 53, 52, 51 along the way, and every one
        // of those is still "> 50" but must never be rejected, or they'd be
        // stuck unable to fix the very thing checkout is blocking them on.
        const isIncrease = !existing || quantity > existing.quantity;
        if (isIncrease && quantity > MAX_QUANTITY_PER_PRODUCT) {
          return { ok: false, reason: "MAX_QUANTITY" };
        }

        set((state) => ({
          items: state.items.map((i) =>
            i.gamepassId === gamepassId ? { ...i, quantity } : i,
          ),
        }));
        return { ok: true };
      },
      // Removes only the quantities that belonged to a specific submitted
      // order, leaving anything the customer added afterward untouched.
      removeOrderedItems: (orderedItems) =>
        set((state) => ({
          items: state.items.reduce<CartItem[]>((acc, item) => {
            const ordered = orderedItems.find(
              (o) => o.gamepassId === item.gamepassId,
            );
            if (!ordered) {
              acc.push(item);
              return acc;
            }
            const remaining = item.quantity - ordered.quantity;
            if (remaining > 0) acc.push({ ...item, quantity: remaining });
            return acc;
          }, []),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "budgetwise-cart" },
  ),
);

// The persist middleware reads localStorage asynchronously after mount, so
// `items` is briefly `[]` on every fresh page load before rehydration
// finishes. Anything that treats an empty cart as significant (e.g.
// redirecting away from checkout) must wait for this first, or it'll act on
// a false "empty cart" before the real persisted data has loaded.
export function useCartHydrated() {
  // useCartStore.persist is only populated in a browser environment, not
  // during server-side prerendering, so this must start false and only
  // read the real API from inside the effect (which never runs on the server).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(useCartStore.persist.hasHydrated());
    return useCartStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}

export const selectCartCount = (state: CartState) =>
  state.items.reduce((sum, i) => sum + i.quantity, 0);

export const selectCartSubtotal = (state: CartState) =>
  state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
