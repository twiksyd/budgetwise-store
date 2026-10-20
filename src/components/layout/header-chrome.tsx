"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";
import { MyOrdersNavBadge } from "@/components/customer-messages/my-orders-link";
import { cn } from "@/lib/utils";

/**
 * The sticky header tightens once the page scrolls: a little shorter, a
 * hairline and a soft shadow appear. data-scrolled drives the styling so
 * the children stay server-rendered.
 */
export function ScrollHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header data-scrolled={scrolled} className={cn("group/header", className)}>
      {children}
    </header>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop nav: the current page's underline glides between links. */
export function HeaderNavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="hidden items-center gap-9 text-sm sm:flex">
      {siteConfig.nav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative py-1.5 transition-colors duration-200",
              active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.href === "/account/orders" && <MyOrdersNavBadge />}
            {active && (
              <motion.span
                layoutId="header-nav-active"
                aria-hidden
                className="bg-primary absolute inset-x-0 -bottom-0.5 h-0.5 rounded-sm"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
