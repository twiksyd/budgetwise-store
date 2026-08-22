"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, Link2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RobuxPlusAcknowledgementLink } from "@/components/catalog/robux-plus-acknowledgement";
import { robuxPlusPresentation, isRobuxPlusGame } from "@/config/robux-products";
import { robuxViaLinkTile } from "@/config/robux-via-link";
import { cn } from "@/lib/utils";
import type { StoreGame } from "@/types/database";

type RobuxOption = {
  id: string;
  title: string;
  badge?: string;
  description: string;
  meta: string;
  href: string;
  iconUrl: string | null;
  color: string | null;
  productCount: number;
  isPreorder?: boolean;
};

function RobuxOptionCard({ option }: { option: RobuxOption }) {
  const content = (
    <div className="surface-premium surface-premium-hover group grid min-h-[132px] grid-cols-[72px_1fr] gap-3 overflow-hidden rounded-2xl p-3 transition-transform active:scale-[0.98] sm:min-h-[150px] sm:grid-cols-[96px_1fr] sm:p-4">
      <div
        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl"
        style={option.color ? { backgroundColor: `${option.color}1a` } : undefined}
      >
        {option.iconUrl ? (
          <Image
            src={option.iconUrl}
            alt={option.title}
            fill
            sizes="96px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <Sparkles className="text-muted-foreground size-8" />
        )}
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {option.isPreorder ? (
              <div className="inline-flex flex-col rounded-xl border border-red-300/50 bg-red-700/90 px-2.5 py-1.5 text-white shadow-sm shadow-red-900/20">
                <span className="text-[10px] font-black tracking-[0.16em]">
                  {option.badge}
                </span>
                <span className="text-xs font-black">
                  {robuxPlusPresentation.shortProcessingTime}
                </span>
              </div>
            ) : option.badge ? (
              <Badge variant="secondary">{option.badge}</Badge>
            ) : null}
            {!option.isPreorder && (
              <span className="text-muted-foreground text-xs font-medium">
                {option.productCount} price{option.productCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <h3 className="font-heading mt-2 text-base font-semibold tracking-tight sm:text-lg">
            {option.title}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed sm:text-sm">
            {option.description}
          </p>
          {option.isPreorder && (
            <p className="mt-2 text-xs font-bold text-red-700 uppercase dark:text-red-300">
              NOT INSTANT - refund if not delivered within 8 hours after
              confirmed payment.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-xs font-medium">
            {option.isPreorder ? (
              <Clock className="size-3.5 shrink-0" />
            ) : (
              <Link2 className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{option.meta}</span>
          </span>
          <span className="text-primary inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
            View Prices
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </div>
  );

  if (option.isPreorder) {
    return (
      <RobuxPlusAcknowledgementLink href={option.href}>
        {content}
      </RobuxPlusAcknowledgementLink>
    );
  }

  return <Link href={option.href}>{content}</Link>;
}

export function RobuxSection({
  games,
  productCounts,
  className,
  compact = false,
}: {
  games: StoreGame[];
  productCounts: Record<string, number>;
  className?: string;
  compact?: boolean;
}) {
  const plusGame = games.find((game) => isRobuxPlusGame(game.id));
  const viaLinkProductCount = productCounts["robux-via-link"] ?? 0;
  const plusProductCount = plusGame ? productCounts[plusGame.id] ?? 0 : 0;

  const options: RobuxOption[] = [];

  if (viaLinkProductCount > 0) {
    options.push({
      id: "robux-via-link",
      title: "Robux Via Link",
      description: "Standard Robux ordering with tax options clearly separated.",
      meta: "Covered Tax or Tax Not Covered",
      href: `/games/${robuxViaLinkTile.slug}`,
      iconUrl: robuxViaLinkTile.iconUrl,
      color: robuxViaLinkTile.color,
      productCount: viaLinkProductCount,
    });
  }

  if (
    plusGame &&
    plusGame.availability_status === "available" &&
    plusProductCount > 0
  ) {
    options.push({
      id: plusGame.id,
      title: robuxPlusPresentation.displayName,
      badge: robuxPlusPresentation.badge,
      description: "Pre-order Robux option for customers who are okay waiting.",
      meta: `Processing time: ${robuxPlusPresentation.processingTime}`,
      href: `/games/${plusGame.slug}`,
      iconUrl: plusGame.icon_url,
      color: plusGame.color,
      productCount: plusProductCount,
      isPreorder: true,
    });
  }

  if (options.length === 0) return null;

  return (
    <section className={cn(className)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-medium">Robux</p>
          <h2
            className={cn(
              "font-heading mt-2 font-semibold tracking-tight",
              compact ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
            )}
          >
            Buy Robux your way.
          </h2>
        </div>
        <Link
          href="/games"
          className="text-primary hidden shrink-0 items-center gap-1 text-sm font-medium hover:underline sm:inline-flex"
        >
          Browse catalog
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
        {options.map((option) => (
          <RobuxOptionCard key={option.id} option={option} />
        ))}
      </div>
    </section>
  );
}
