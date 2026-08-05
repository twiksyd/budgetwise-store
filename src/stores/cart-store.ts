import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types/domain";

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (gamepassId: string) => void;
  setQuantity: (gamepassId: string, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.gamepassId === item.gamepassId,
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.gamepassId === item.gamepassId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity }] };
        }),
      removeItem: (gamepassId) =>
        set((state) => ({
          items: state.items.filter((i) => i.gamepassId !== gamepassId),
        })),
      setQuantity: (gamepassId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.gamepassId !== gamepassId)
              : state.items.map((i) =>
                  i.gamepassId === gamepassId ? { ...i, quantity } : i,
                ),
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
