"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { MobileNav } from "@/components/layout/mobile-nav";
import { MyOrdersHeaderLink, MyOrdersNavBadge } from "@/components/customer-messages/my-orders-link";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="glass-surface sticky top-0 z-50 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-20 sm:px-6">
        <div className="flex items-center gap-2.5 sm:gap-4">
          <MobileNav />
          <Link href="/" aria-label="BudgetWise home" className="flex flex-col items-center gap-0.5">
            <BrandMark className="h-12 sm:h-14" />
          </Link>
        </div>
        <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm lg:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href || pathname?.startsWith(`${item.href}/`) ? "page" : undefined}
              className="aria-[current=page]:text-foreground aria-[current=page]:bg-[length:100%_1px] text-muted-foreground hover:text-foreground bg-[linear-gradient(currentColor,currentColor)] bg-position-[0%_100%] bg-no-repeat bg-[length:0%_1px] py-0.5 transition-[background-size,color] duration-300 ease-out hover:bg-[length:100%_1px]"
            >
              {item.label}
              {item.href === "/account/orders" && <MyOrdersNavBadge />}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-0.5">
          <MyOrdersHeaderLink />
          <CartTrigger />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
