"use client";

import { ArrowUpRight, BadgeCheck, Heart, Sparkles } from "lucide-react";
import type { VouchRequestDto } from "@/lib/chat/vouch-request.mjs";
import { cn } from "@/lib/utils";

export function VouchRequestCard({ request, isMine }: { request: VouchRequestDto; isMine: boolean }) {
  return (
    <article
      className={cn(
        "surface-premium relative w-[min(19rem,82vw)] overflow-hidden rounded-3xl border border-violet-300/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(245,243,255,0.96))] p-4 text-left dark:border-violet-400/20 dark:bg-[linear-gradient(145deg,rgba(35,28,55,0.98),rgba(21,18,34,0.98))]",
        isMine && "ml-auto",
      )}
      data-testid="vouch-request-card"
    >
      <div
        className="pointer-events-none absolute -top-16 -right-12 size-36 rounded-full bg-violet-400/20 blur-3xl motion-safe:animate-pulse"
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/25">
          <Heart className="size-5 fill-current" aria-hidden />
          <Sparkles className="absolute -top-1 -right-1 size-3.5 text-amber-300 motion-safe:animate-pulse" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.16em] text-violet-700 uppercase dark:text-violet-300">
            <BadgeCheck className="size-3.5" aria-hidden /> BudgetWise Vouch
          </p>
          <h3 className="font-heading mt-1 text-base font-bold tracking-tight">Loved your experience?</h3>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            A quick vouch helps more players shop with confidence. Thank you for supporting BudgetWise!
          </p>
        </div>
      </div>
      <a
        href={request.facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-4 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1268d3] hover:shadow-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-blue-500/40 motion-reduce:transform-none"
        data-testid="leave-vouch-link"
      >
        Leave a vouch on Facebook
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
      <p className="relative mt-2 text-center text-[10px] font-medium text-violet-700/75 dark:text-violet-300/75">
        Opens the official BudgetWise vouch post
      </p>
    </article>
  );
}
