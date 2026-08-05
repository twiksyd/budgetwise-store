import Link from "next/link";
import Image from "next/image";
import { Gamepad2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StoreGame } from "@/types/database";

export function GameCard({ game }: { game: StoreGame }) {
  return (
    <Link href={`/games/${game.slug}`}>
      <Card className="group hover:border-primary/40 gap-3 overflow-hidden p-0 transition-colors">
        <div
          className="bg-muted relative flex aspect-square items-center justify-center"
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
              className="object-cover"
            />
          ) : (
            <Gamepad2 className="text-muted-foreground size-10" />
          )}
          {game.is_discounted && (
            <Badge className="absolute top-2 right-2">Sale</Badge>
          )}
          {game.name === "ROBUX PLUS" && (
            <Badge className="absolute top-2 left-2 h-auto bg-red-600 px-2.5 py-1 text-sm font-bold text-white [a]:hover:bg-red-600">
              PLUS
            </Badge>
          )}
        </div>
        <div className="px-4 pb-4">
          <h3 className="font-heading truncate text-sm font-semibold">
            {game.name}
          </h3>
          {game.category && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {game.category}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
