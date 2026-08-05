import Link from "next/link";
import Image from "next/image";
import { Clock, Gamepad2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UnavailableRibbon } from "@/components/catalog/unavailable-ribbon";
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

  const artwork = (
    <div
      className="bg-muted relative flex aspect-square items-center justify-center overflow-hidden"
      style={game.color ? { backgroundColor: `${game.color}1a` } : undefined}
    >
      {game.icon_url ? (
        <Image
          src={game.icon_url}
          alt={game.name}
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
        <Gamepad2 className="text-muted-foreground size-10" />
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
      {game.name === "ROBUX PLUS" && (
        <Badge className="absolute top-2.5 left-2.5 h-auto bg-red-600 px-2.5 py-1 text-sm font-bold text-white [a]:hover:bg-red-600">
          PLUS
        </Badge>
      )}
    </div>
  );

  const details = (
    <div className="px-4 pt-3.5 pb-4">
      <h3 className="font-heading truncate text-[13.5px] font-semibold">
        {game.name}
      </h3>
      <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
        {game.category && <span className="truncate">{game.category}</span>}
        {game.category && productCount !== undefined && <span>·</span>}
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

  return (
    <Link
      href={`/games/${game.slug}`}
      className={cn(
        "surface-premium surface-premium-hover group block overflow-hidden rounded-2xl transition-transform active:scale-[0.97]",
        isComingSoon && "opacity-80",
      )}
    >
      {artwork}
      {details}
    </Link>
  );
}
