import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GameArtworkFallback } from "@/components/catalog/game-artwork-fallback";
import { UnavailableRibbon } from "@/components/catalog/unavailable-ribbon";
import { cn } from "@/lib/utils";
import type { StoreGame } from "@/types/database";

export function FeaturedGameCard({
  game,
  productCount,
  wide = false,
  className,
}: {
  game: StoreGame;
  productCount: number;
  wide?: boolean;
  className?: string;
}) {
  const isComingSoon = game.availability_status === "coming_soon";
  const isUnavailable = game.availability_status === "temporarily_unavailable";

  const artwork = (
    <div
      className={cn(
        "bg-muted relative overflow-hidden",
        wide ? "aspect-[21/9] sm:aspect-[3/1]" : "aspect-[4/3]",
      )}
      style={game.color ? { backgroundColor: `${game.color}1a` } : undefined}
    >
      {game.icon_url ? (
        <Image
          src={game.icon_url}
          alt={game.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className={cn(
            "object-cover transition-transform duration-500 ease-out",
            isUnavailable
              ? "grayscale-[0.6] opacity-70"
              : "saturate-90 group-hover:scale-105",
          )}
        />
      ) : (
        <GameArtworkFallback
          name={game.name}
          color={game.color}
          className="text-7xl opacity-20"
        />
      )}
      {!isUnavailable && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
      )}
      <Badge className="absolute top-2.5 left-2.5 gap-1 sm:top-3 sm:left-3">
        <Sparkles className="size-3" />
        Featured
      </Badge>
      {isUnavailable && <UnavailableRibbon />}
      {isComingSoon && (
        <Badge variant="outline" className="bg-background/80 absolute top-3 right-3 gap-1">
          <Clock className="size-3" />
          Coming Soon
        </Badge>
      )}
    </div>
  );

  const details = (
    <div className="flex items-center justify-between gap-2 p-3 sm:gap-3 sm:p-5">
      <div className="min-w-0">
        <h3 className="font-heading truncate text-[13.5px] font-semibold sm:text-lg">
          {game.name}
        </h3>
        <p className="text-muted-foreground mt-0.5 text-[11px] sm:text-sm">
          {productCount} product{productCount === 1 ? "" : "s"} available
        </p>
      </div>
      {!isUnavailable && (
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-1 sm:size-10">
          <ArrowRight className="size-3.5 sm:size-4" />
        </span>
      )}
    </div>
  );

  if (isUnavailable) {
    return (
      <div className={cn("surface-premium cursor-default overflow-hidden rounded-2xl", className)}>
        {artwork}
        {details}
      </div>
    );
  }

  return (
    <Link
      href={`/games/${game.slug}`}
      className={cn(
        "surface-premium surface-premium-hover group block overflow-hidden rounded-2xl transition-transform active:scale-[0.98]",
        className,
      )}
    >
      {artwork}
      {details}
    </Link>
  );
}
