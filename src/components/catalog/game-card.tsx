import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GameArtworkFallback } from "@/components/catalog/game-artwork-fallback";
import { RobuxPlusAcknowledgementLink } from "@/components/catalog/robux-plus-acknowledgement";
import { UnavailableRibbon } from "@/components/catalog/unavailable-ribbon";
import { isRobuxPlusGame, robuxPlusPresentation } from "@/config/robux-products";
import { cn } from "@/lib/utils";
import type { StoreGame } from "@/types/database";

export function GameCard({
  game,
  productCount,
  priority = false,
  showCategory = true,
  layout = "grid",
}: {
  game: StoreGame;
  productCount?: number;
  /** First-screen cards: load the artwork eagerly. */
  priority?: boolean;
  /** Off on the homepage shelf, where only the product count is shown. */
  showCategory?: boolean;
  /** "shelf": the homepage carousel — 4:3 artwork, roomier type. */
  layout?: "grid" | "shelf";
}) {
  const isShelf = layout === "shelf";
  const isComingSoon = game.availability_status === "coming_soon";
  const isUnavailable = game.availability_status === "temporarily_unavailable";
  const isRobuxPlus = isRobuxPlusGame(game.id);
  const displayName = isRobuxPlus ? robuxPlusPresentation.displayName : game.name;
  // Secondary line: product count always; the category (or Robux Plus
  // processing time) only where the shelf has room for it.
  const meta = !showCategory ? null : isRobuxPlus ? "1-8 hrs" : game.category;

  const artwork = (
    <div
      className={cn(
        "bg-muted relative flex shrink-0 items-center justify-center overflow-hidden",
        isShelf ? "aspect-[4/3]" : "aspect-square",
      )}
      style={game.color ? { backgroundColor: `${game.color}1a` } : undefined}
    >
      {game.icon_url ? (
        <Image
          src={game.icon_url}
          alt={displayName}
          fill
          priority={priority}
          sizes={
            isShelf
              ? "(min-width: 640px) 240px, 64vw"
              : "(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
          }
          className={cn(
            "object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isUnavailable
              ? "grayscale-[0.6] opacity-70"
              : "saturate-90 group-hover:scale-[1.06]",
          )}
        />
      ) : (
        <GameArtworkFallback
          name={game.name}
          color={game.color}
          className="text-5xl opacity-20"
        />
      )}
      {!isUnavailable && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}
      {isUnavailable && <UnavailableRibbon />}
      {isComingSoon && (
        <Badge variant="outline" className="bg-background/80 absolute top-2.5 right-2.5 gap-1">
          <Clock className="size-3" />
          Coming Soon
        </Badge>
      )}
      {!isComingSoon && !isUnavailable && game.is_discounted && (
        <Badge className="absolute top-2.5 right-2.5">Sale</Badge>
      )}
      {isRobuxPlus && !isUnavailable && (
        <div className="absolute top-2.5 left-2.5 rounded-xl border border-[rgba(239,68,68,0.35)] bg-[rgba(248,113,113,0.20)] px-2.5 py-1.5 text-red-900 shadow-[0_8px_22px_-16px_rgba(239,68,68,0.80)] backdrop-blur-sm">
          <p className="text-[10px] leading-none font-black tracking-[0.16em]">
            {robuxPlusPresentation.badge}
          </p>
          <p className="mt-1 text-[11px] leading-none font-black">
            1-8 HOURS
          </p>
        </div>
      )}
    </div>
  );

  const details = (
    <div
      className={cn(
        "relative flex-1",
        isShelf ? "px-4 pt-3.5 pb-4" : "px-3.5 pt-3 pb-3.5 sm:px-4 sm:pt-3.5 sm:pb-4",
      )}
    >
      {!isUnavailable && (
        <ArrowUpRight
          aria-hidden
          className="text-primary absolute top-3.5 right-3.5 size-4 -translate-x-1 translate-y-1 opacity-0 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
        />
      )}
      {/* Up to two lines, so long names ("Run a Sari Sari store") read in
          full. The count sits right under the title; cards in a row still
          share one height (the card stretches), with any spare space at
          the bottom rather than between title and count. */}
      <h3
        title={displayName}
        className={cn(
          "font-heading line-clamp-2 leading-[1.3] font-semibold break-words sm:pr-5",
          isShelf ? "text-[15px]" : "text-sm",
        )}
      >
        {displayName}
      </h3>
      <div
        className={cn(
          "text-muted-foreground mt-1 flex items-center gap-1",
          isShelf ? "text-[13px]" : "text-xs",
        )}
      >
        {meta && <span className="truncate">{meta}</span>}
        {meta && productCount !== undefined && <span aria-hidden>·</span>}
        {productCount !== undefined && (
          <span className="shrink-0">
            {productCount} product{productCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );

  // Unavailable games stay visible so customers know we normally sell
  // them, but shouldn't invite a tap — the ribbon already says everything
  // there is to say without opening the game page.
  if (isUnavailable) {
    return (
      <div className="surface-premium flex h-full cursor-default flex-col overflow-hidden rounded-xl">
        {artwork}
        {details}
      </div>
    );
  }

  const className = cn(
    "surface-premium surface-premium-hover group flex h-full flex-col overflow-hidden rounded-xl transition-transform active:scale-[0.97]",
    isComingSoon && "opacity-80",
  );

  if (isRobuxPlus) {
    return (
      <RobuxPlusAcknowledgementLink
        href={`/games/${game.slug}`}
        className={className}
      >
        {artwork}
        {details}
      </RobuxPlusAcknowledgementLink>
    );
  }

  return (
    <Link href={`/games/${game.slug}`} className={className}>
      {artwork}
      {details}
    </Link>
  );
}
