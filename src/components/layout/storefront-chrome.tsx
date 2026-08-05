"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { FloatingCartButton } from "@/components/cart/floating-cart-button";
import { StoreStatusBanner } from "@/components/shared/store-status-banner";
import type { StoreStatus } from "@/types/store-operations";

// The /admin surface renders its own shell (see
// src/app/admin/(protected)/layout.tsx) — no public nav, footer, cart
// drawer, or store-status banner, since it's a different audience
// entirely. Branching here (rather than restructuring into multiple root
// layouts) keeps every existing storefront route untouched.
export function StorefrontChrome({
  status,
  noticeMessage,
  children,
}: {
  status: StoreStatus;
  noticeMessage: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  // Redundant while already looking at the cart or mid-checkout.
  const showFloatingCartButton =
    !pathname?.startsWith("/cart") && !pathname?.startsWith("/checkout");

  return (
    <>
      {status !== "open" && (
        <StoreStatusBanner status={status} noticeMessage={noticeMessage} />
      )}
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartDrawer />
      {showFloatingCartButton && <FloatingCartButton />}
    </>
  );
}
