import Link from "next/link";
import Image from "next/image";
import { Gamepad2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StoreGame } from "@/types/database";

export function GameCard({ game }: { game: StoreGame }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="surface-premium surface-premium-hover group block overflow-hidden rounded-2xl"
    >
      <div
        className="bg-muted relative flex aspect-square items-center justify-center overflow-hidden"
        style={
          game.color ? { backgroundColor: `${game.color}1a` } : undefined
        }
      >
        {game.icon_url ? (
          <Image
            src={game.icon_url}
            alt={game.name}
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <Gamepad2 className="text-muted-foreground size-10" />
        )}
        {game.is_discounted && (
          <Badge className="absolute top-2.5 right-2.5">Sale</Badge>
        )}
        {game.name === "ROBUX PLUS" && (
          <Badge className="absolute top-2.5 left-2.5 h-auto bg-red-600 px-2.5 py-1 text-sm font-bold text-white [a]:hover:bg-red-600">
            PLUS
          </Badge>
        )}
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <h3 className="font-heading truncate text-[13.5px] font-semibold">
          {game.name}
        </h3>
        {game.category && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {game.category}
          </p>
        )}
      </div>
    </Link>
  );
}
