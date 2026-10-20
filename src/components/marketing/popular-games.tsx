"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GameGrid } from "@/components/catalog/game-grid";
import { RevealText } from "@/components/motion/reveal";
import type { StoreGame } from "@/types/database";

export function PopularGames({ games }: { games: StoreGame[] }) {
  if (games.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 sm:pb-28">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            <RevealText text="Jump back into what you play." />
          </h2>
        </div>
        <Link
          href="/games"
          className="group text-primary hidden shrink-0 items-center gap-1 text-sm font-medium sm:inline-flex"
        >
          <span className="bw-link">See all games</span>
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </div>

      <GameGrid games={games} />

      <div className="mt-8 text-center sm:hidden">
        <Link
          href="/games"
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          See all games
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
