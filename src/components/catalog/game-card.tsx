import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";
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
}: {
  game: StoreGame;
  productCount?: number;
}) {
  const isComingSoon = game.availability_status === "coming_soon";
  const isUnavailable = game.availability_status === "temporarily_unavailable";
  const isRobuxPlus = isRobuxPlusGame(game.id);
  const displayName = isRobuxPlus ? robuxPlusPresentation.displayName : game.name;

  const artwork = (
    <div
      className="bg-muted relative flex aspect-square items-center justify-center overflow-hidden"
      style={game.color ? { backgroundColor: `${game.color}1a` } : undefined}
    >
      {game.icon_url ? (
        <Image
          src={game.icon_url}
          alt={displayName}
          fill
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
          className={cn(
            "object-cover transition-transform duration-500 ease-out",
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
    <div className="px-4 pt-3.5 pb-4">
      <h3 className="font-heading truncate text-[13.5px] font-semibold">
        {displayName}
      </h3>
      <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
        {isRobuxPlus ? (
          <span className="truncate">Processing 1-8 hrs</span>
        ) : (
          game.category && <span className="truncate">{game.category}</span>
        )}
        {(isRobuxPlus || game.category) && productCount !== undefined && <span>·</span>}
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
      <div className="surface-premium cursor-default overflow-hidden rounded-2xl">
        {artwork}
        {details}
      </div>
    );
  }

  const className = cn(
    "surface-premium surface-premium-hover group block overflow-hidden rounded-2xl transition-transform active:scale-[0.97]",
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
