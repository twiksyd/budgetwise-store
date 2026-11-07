"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { siteConfig } from "@/config/site";
import { BrandMark } from "@/components/brand/brand-mark";
import { getTikTokSupportLink } from "@/lib/support-links";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

type FooterLink = { label: string; href: string };

const linkClass =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-sm transition-colors outline-none focus-visible:ring-2";

// The one footer for every public page (rendered by StorefrontChrome).
// A quiet, slightly off-page surface with a hairline top edge so it reads as
// "end of page", not as one more content section. Phones get the link groups
// as collapsed accordion rows; sm+ shows brand / Company / Legal as columns
// inside the same max-w-6xl container the header and pages use.
export function SiteFooter() {
  const supportLink = getTikTokSupportLink();
  const footerRef = useRef<HTMLElement>(null);
  const setFooterInView = useUIStore((state) => state.setFooterInView);

  // Floating controls (cart shortcut, "Categories" jump) step aside while
  // the footer is on screen so they never sit on top of its links.
  useEffect(() => {
    const node = footerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setFooterInView(entry.isIntersecting),
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setFooterInView(false);
    };
  }, [setFooterInView]);

  const groups = Object.entries(siteConfig.footerNav) as [string, readonly FooterLink[]][];

  return (
    <footer
      ref={footerRef}
      className="bg-footer border-footer-border border-t text-[13px] leading-relaxed"
    >
      <div className="mx-auto max-w-6xl px-5 pt-7 pb-[calc(1.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10 sm:pb-8">
        <div className="sm:grid sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-10">
          <div>
            <Link
              href="/"
              aria-label={`${siteConfig.name} home`}
              className="focus-visible:ring-ring/50 inline-flex rounded-sm outline-none focus-visible:ring-2"
            >
              <BrandMark className="h-9" />
            </Link>
            <p className="text-muted-foreground mt-2.5 max-w-xs">
              Discounted Roblox gamepasses and Robux.
            </p>
            {supportLink && (
              <a
                href={supportLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(linkClass, "mt-2 inline-block underline-offset-4 hover:underline")}
              >
                General questions? Message us on TikTok
              </a>
            )}
          </div>

          {/* Phones: collapsed accordion rows. */}
          <div className="border-footer-border mt-6 border-t sm:hidden">
            {groups.map(([heading, links]) => (
              <FooterAccordion key={heading} heading={heading} links={links} />
            ))}
          </div>

          {/* sm+: every link visible in its column. */}
          {groups.map(([heading, links]) => (
            <nav key={heading} aria-label={heading} className="hidden sm:block">
              <h2 className="text-foreground text-xs font-semibold tracking-wide">
                {heading}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-footer-border text-muted-foreground flex flex-col gap-1 pt-5 text-xs sm:mt-8 sm:border-t sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <p>Not affiliated with Roblox Corporation.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterAccordion({
  heading,
  links,
}: {
  heading: string;
  links: readonly FooterLink[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <nav aria-label={heading} className="border-footer-border border-b">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="text-foreground focus-visible:ring-ring/50 flex min-h-12 w-full items-center justify-between gap-3 rounded-sm text-sm font-medium outline-none focus-visible:ring-2"
        >
          {heading}
          <ChevronDown
            aria-hidden
            className={cn(
              "text-muted-foreground size-4 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <ul id={panelId} hidden={!open} className="flex flex-col pb-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={cn(linkClass, "flex min-h-11 items-center text-sm")}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
