import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MyOrdersHeaderLink } from "@/components/customer-messages/my-orders-link";
import { HeaderNavLinks, ScrollHeader } from "@/components/layout/header-chrome";

export function SiteHeader() {
  return (
    <ScrollHeader className="glass-surface sticky top-0 z-50 transition-[box-shadow,background-color] duration-300 data-[scrolled=true]:bg-background/85 data-[scrolled=true]:shadow-[0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent),0_8px_24px_-16px_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-20 sm:px-6">
        <div className="flex items-center gap-2.5 sm:gap-4">
          <MobileNav />
          <Link href="/" className="flex flex-col items-center gap-0.5">
            <BrandMark className="h-12 origin-left transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:h-14 sm:group-data-[scrolled=true]/header:scale-[0.88]" />
          </Link>
        </div>
        <HeaderNavLinks />
        <div className="flex items-center gap-1 sm:gap-0.5">
          <MyOrdersHeaderLink />
          <CartTrigger />
          <ThemeToggle />
        </div>
      </div>
    </ScrollHeader>
  );
}
