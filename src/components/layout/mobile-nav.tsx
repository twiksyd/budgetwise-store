"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/brand/brand-mark";
import { siteConfig } from "@/config/site";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open menu"
        className="size-11 lg:hidden"
      >
        <Menu className="size-5" />
      </Button>
      </SheetTrigger>
      <SheetContent side="left" className="data-[side=left]:w-[min(88vw,360px)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex flex-col items-start gap-2">
            <BrandMark className="h-16" />
          </SheetTitle>
        </SheetHeader>
        <p className="text-muted-foreground px-7 pb-4 text-sm">All about delivering value.</p>
        <nav aria-label="Mobile navigation" className="flex flex-col gap-2 px-4">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href || pathname?.startsWith(`${item.href}/`) ? "page" : undefined}
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:text-foreground flex min-h-12 items-center rounded-xl px-4 py-3.5 text-base font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t p-6">
          <p className="text-muted-foreground mb-3 text-sm">Need a hand choosing?</p>
          <Link href="/contact" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">Contact us <ArrowUpRight className="size-4" /></Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
