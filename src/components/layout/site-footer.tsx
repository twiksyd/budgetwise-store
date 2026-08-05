import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { siteConfig } from "@/config/site";
import { BrandMark } from "@/components/brand/brand-mark";
import { Taglish } from "@/components/shared/taglish";
import { getGeneralMessengerLink } from "@/lib/messenger";

export function SiteFooter() {
  const messengerLink = getGeneralMessengerLink();

  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 sm:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark className="h-12" />
              <span className="flex flex-col justify-center">
                <span className="font-heading text-base leading-tight font-semibold tracking-tight">
                  {siteConfig.name}
                </span>
                <span className="text-muted-foreground mt-0.5 text-[11px] leading-tight font-normal">
                  {siteConfig.slogan}
                </span>
              </span>
            </div>
            <p className="text-muted-foreground mt-4 max-w-xs text-sm leading-relaxed">
              A digital marketplace for discounted in-game currency,
              gamepasses, and subscriptions. Every order is placed on the
              site first, then confirmed with a real person over Messenger.
            </p>
            <Taglish className="max-w-xs">
              Isang online store para sa mas mura na in-game currency,
              gamepasses, at subscriptions. Ang bawat order ay ginagawa
              muna sa site, tapos kinukumpirma ng tunay na tao sa Messenger.
            </Taglish>
            {messengerLink && (
              <a
                href={messengerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary mt-5 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
              >
                <MessageCircle className="size-4" />
                Message us on Messenger
              </a>
            )}
          </div>

          {Object.entries(siteConfig.footerNav).map(([heading, links]) => (
            <div key={heading}>
              <p className="text-sm font-semibold">{heading}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border/60 text-muted-foreground mt-12 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights
            reserved.
          </p>
          <p>Not affiliated with Roblox Corporation.</p>
        </div>
      </div>
    </footer>
  );
}
