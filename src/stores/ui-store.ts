import { create } from "zustand";

interface UIState {
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  setCartOpen: (open: boolean) => void;
  // True while the site footer is on screen; floating controls hide so they
  // never cover its links.
  footerInView: boolean;
  setFooterInView: (inView: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isCartOpen: false,
  openCart: () => set({ isCartOpen: true }),
  closeCart: () => set({ isCartOpen: false }),
  setCartOpen: (open) => set({ isCartOpen: open }),
  footerInView: false,
  setFooterInView: (inView) => set({ footerInView: inView }),
}));
