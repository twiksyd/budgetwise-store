"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GameGrid } from "@/components/catalog/game-grid";
import type { StoreGame } from "@/types/database";

export function PopularGames({ games }: { games: StoreGame[] }) {
  if (games.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 sm:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <p className="text-primary text-sm font-medium">Popular games</p>
          <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Jump back into what you play.
          </h2>
        </div>
        <Link
          href="/games"
          className="text-primary hidden shrink-0 items-center gap-1 text-sm font-medium hover:underline sm:inline-flex"
        >
          See all games
          <ArrowRight className="size-3.5" />
        </Link>
      </motion.div>

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
