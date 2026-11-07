"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { CART_ADDED_TOAST_ID } from "@/components/cart/add-to-cart-button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { FloatingCartButton } from "@/components/cart/floating-cart-button";
import { RouteTransitionShell } from "@/components/layout/route-transition-shell";
import { StoreStatusBanner } from "@/components/shared/store-status-banner";
import { CustomerMessagesProvider } from "@/components/customer-messages/customer-messages-provider";
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

  // "Na-add na sa cart" toasts belong to the page they were raised on: once
  // the customer opens the cart or checkout they're obsolete, and left up
  // they cover the step indicator at the top of the next page.
  useEffect(() => {
    toast.dismiss(CART_ADDED_TOAST_ID);
  }, [pathname]);

  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  // A chat page IS the messenger (order chats, the General Inquiry, and the
  // /messages entry that picks one): on phones it fills the screen (its own
  // compact header has the way back), with no footer or floating buttons.
  const isMessengerPage = (pathname?.startsWith("/orders/") || pathname === "/messages") ?? false;
  // Redundant while already looking at the cart or mid-checkout.
  const showFloatingCartButton =
    !isMessengerPage && !pathname?.startsWith("/cart") && !pathname?.startsWith("/checkout");

  return (
    <CustomerMessagesProvider>
      {status !== "open" && (
        <StoreStatusBanner status={status} noticeMessage={noticeMessage} />
      )}
      <div className={isMessengerPage ? "hidden sm:contents" : "contents"}>
        <SiteHeader />
      </div>
      {isMessengerPage ? (
        // Not inside the animated wrapper: its transform would turn the
        // chat's full-screen `position: fixed` into "fixed to the wrapper",
        // leaving the page underneath scrollable and visible.
        <main className="bg-background relative flex-1">{children}</main>
      ) : (
        <RouteTransitionShell>{children}</RouteTransitionShell>
      )}
      {!isMessengerPage && <SiteFooter />}
      <CartDrawer />
      {showFloatingCartButton && <FloatingCartButton />}
    </CustomerMessagesProvider>
  );
}
