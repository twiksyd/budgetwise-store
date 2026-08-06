"use client";

import { createContext, useContext } from "react";
import type { StoreStatus } from "@/types/store-operations";

const StoreStatusContext = createContext<StoreStatus>("open");

// Fed once from the single resolveStoreStatusSafe() call already made in
// the root layout — every client component that needs to know whether the
// store is open (hero badge, catalog stats, cart CTA, ...) reads from here
// instead of guessing or hardcoding "open", so there's exactly one source
// of truth on the page at any moment.
export function StoreStatusProvider({
  status,
  children,
}: {
  status: StoreStatus;
  children: React.ReactNode;
}) {
  return (
    <StoreStatusContext.Provider value={status}>
      {children}
    </StoreStatusContext.Provider>
  );
}

export function useStoreStatus(): StoreStatus {
  return useContext(StoreStatusContext);
}
