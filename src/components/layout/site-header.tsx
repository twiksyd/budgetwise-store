import Link from "next/link";
import { siteConfig } from "@/config/site";
import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { MobileNav } from "@/components/layout/mobile-nav";

export function SiteHeader() {
  return (
    <header className="glass-surface fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:h-24 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <MobileNav />
          <Link href="/" className="flex items-center">
            <BrandMark className="h-12 sm:h-[65px]" />
          </Link>
        </div>
        <nav className="hidden items-center gap-10 text-sm sm:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground bg-[linear-gradient(currentColor,currentColor)] bg-position-[0%_100%] bg-no-repeat bg-[length:0%_1px] py-0.5 transition-[background-size,color] duration-300 ease-out hover:bg-[length:100%_1px]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-0.5">
          <CartTrigger />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
