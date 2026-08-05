import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock, Construction, Gamepad2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Link
      href={`/games/${game.slug}`}
      className={cn(
        "surface-premium surface-premium-hover group block overflow-hidden rounded-2xl transition-transform active:scale-[0.98]",
        className,
      )}
    >
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
            sizes="(min-width: 640px) 50vw, 85vw"
            className="object-cover saturate-90 transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-12" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        <Badge className="absolute top-3 left-3 gap-1">
          <Sparkles className="size-3" />
          Featured
        </Badge>
        {isComingSoon && (
          <Badge variant="outline" className="bg-background/80 absolute top-3 right-3 gap-1">
            <Clock className="size-3" />
            Coming Soon
          </Badge>
        )}
        {isUnavailable && (
          <Badge variant="outline" className="bg-background/80 absolute top-3 right-3 gap-1">
            <Construction className="size-3" />
            Unavailable
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h3 className="font-heading truncate text-lg font-semibold">
            {game.name}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {productCount} product{productCount === 1 ? "" : "s"} available
          </p>
        </div>
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-1">
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
