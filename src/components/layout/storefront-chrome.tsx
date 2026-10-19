"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { FloatingCartButton } from "@/components/cart/floating-cart-button";
import { RouteTransitionShell } from "@/components/layout/route-transition-shell";
import { StoreStatusBanner } from "@/components/shared/store-status-banner";
import { CustomerMessagesProvider } from "@/components/customer-messages/customer-messages-provider";
import { FloatingMessageButton } from "@/components/customer-messages/floating-message-button";
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

  // A chat page IS the messenger (order chats, the General Inquiry, and the
  // /messages entry that picks one): on phones it fills the screen (its own
  // compact header has the way back), with no footer or floating buttons.
  const isMessengerPage = (pathname?.startsWith("/orders/") || pathname === "/messages") ?? false;
  // Redundant while already looking at the cart or mid-checkout.
  const showFloatingCartButton =
    !isMessengerPage && !pathname?.startsWith("/cart") && !pathname?.startsWith("/checkout");
  // Never over checkout or cart actions; not needed on the messenger itself.
  const showFloatingMessages =
    !isMessengerPage &&
    !pathname?.startsWith("/cart") &&
    !pathname?.startsWith("/checkout") &&
    !pathname?.startsWith("/login") &&
    !pathname?.startsWith("/auth");

  return (
    <CustomerMessagesProvider>
      {!isMessengerPage && <a href="#main-content" className="bg-foreground text-background fixed top-3 left-4 z-[100] -translate-y-24 rounded-full px-5 py-3 text-sm font-medium focus:translate-y-0">Skip to content</a>}
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
      {showFloatingMessages && <FloatingMessageButton />}
    </CustomerMessagesProvider>
  );
}
