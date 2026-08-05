import Link from "next/link";
import { siteConfig } from "@/config/site";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { CartTrigger } from "@/components/cart/cart-trigger";
import { MobileNav } from "@/components/layout/mobile-nav";

export function SiteHeader() {
  return (
    <header className="glass-surface fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-1">
          <MobileNav />
          <Link
            href="/"
            className="font-heading text-lg font-semibold tracking-tight"
          >
            {siteConfig.name}
          </Link>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <CartTrigger />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
