"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { GameCard } from "@/components/catalog/game-card";
import type { StoreGame } from "@/types/database";

const AUTOPLAY_MS = 5000;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The homepage's game shelf, directly under the hero: one native, swipeable
// row (CSS scroll snap). On phones ~1.4 cards show so the next one invites
// a swipe; on desktop several show, with previous/next buttons.
//
// Gentle autoplay: one timer advances to the next real card every 5s and
// stops at the last one with a replay control (no loop, no cloned cards).
//   - It waits while the row is mostly offscreen, the tab is hidden, a card
//     has focus, or a finger/mouse is held on the row, and carries on by
//     itself afterwards.
//   - It stops for good only when the customer actually scrolls the row
//     sideways (swipe, trackpad, arrow keys, the arrow buttons) or presses
//     pause; then only play brings it back. Merely touching the row (e.g. to
//     scroll the page vertically, or to tap a card) does not stop it.
//   - Autoplay's own scrolling is recognised and never counts as the user's.
//   - Off by default for reduced motion.
type AutoplayState = "playing" | "paused" | "ended";

export function PopularGames({
  games,
  productCounts,
}: {
  games: StoreGame[];
  productCounts?: Record<string, number>;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [autoplay, setAutoplayState] = useState<AutoplayState>("paused");

  // Live conditions read by the timer, kept in refs so they never re-render.
  const playingRef = useRef(false);
  const inViewRef = useRef(false);
  const focusWithinRef = useRef(false);
  const holdingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Programmatic scroll in flight: its target, and when to stop waiting for it.
  const autoScrollRef = useRef<{ target: number; until: number } | null>(null);
  const lastLeftRef = useRef(0);
  const ignoreScrollUntilRef = useRef(0);

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Card start positions, measured fresh each time (so a rotation or resize
  // never leaves them stale): where scrollLeft must be for card i to sit on
  // the page margin.
  const cardStops = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return [];
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    const max = el.scrollWidth - el.clientWidth;
    return Array.from(el.children as HTMLCollectionOf<HTMLElement>).map((card) =>
      Math.min(Math.max(card.offsetLeft - pad, 0), max),
    );
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // Scroll the row ourselves, marked so the scroll listener ignores it.
  const autoScrollTo = useCallback((left: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const smooth = !prefersReducedMotion();
    autoScrollRef.current = { target: left, until: performance.now() + (smooth ? 2500 : 300) };
    el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Focus is checked both from focus events and directly (activeElement), so
  // a focused card pauses the row even where focus events are unreliable.
  const isWaiting = useCallback(() => {
    const el = scrollerRef.current;
    const focusInside =
      focusWithinRef.current || Boolean(el && el.contains(document.activeElement));
    return focusInside || holdingRef.current;
  }, []);

  const changeState = useCallback((next: AutoplayState) => {
    playingRef.current = next === "playing";
    setAutoplayState(next);
  }, []);

  // Moves one card; at the last card, ends instead. Returns false when ended.
  const advance = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return false;
    const next = cardStops().find((stop) => stop > el.scrollLeft + 4);
    if (next === undefined) {
      changeState("ended");
      return false;
    }
    autoScrollTo(next);
    return true;
  }, [autoScrollTo, cardStops, changeState]);

  // The single autoplay timer. Re-armed (never stacked) whenever a
  // condition changes; it only exists while autoplay could actually run.
  const schedule = useCallback(() => {
    clearTimer();
    const canRun =
      playingRef.current && inViewRef.current && document.visibilityState === "visible";
    if (!canRun) return;

    timerRef.current = setTimeout(() => {
      if (isWaiting()) {
        schedule();
        return;
      }
      if (advance()) schedule();
    }, AUTOPLAY_MS);
  }, [advance, clearTimer, isWaiting]);

  // The customer took over: stop until they explicitly press play.
  const stopByUser = useCallback(() => {
    if (!playingRef.current) return;
    changeState("paused");
    clearTimer();
  }, [changeState, clearTimer]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    lastLeftRef.current = el.scrollLeft;
    updateEdges();

    const onScroll = () => {
      updateEdges();
      const left = el.scrollLeft;
      const auto = autoScrollRef.current;
      if (auto) {
        // Our own scroll (including the browser's snap settling at its end).
        if (Math.abs(left - auto.target) < 2 || performance.now() > auto.until) {
          autoScrollRef.current = null;
        }
      } else if (
        performance.now() > ignoreScrollUntilRef.current &&
        Math.abs(left - lastLeftRef.current) > 2
      ) {
        // The row moved sideways and we didn't move it: the customer did.
        stopByUser();
      }
      lastLeftRef.current = left;
    };

    // A resize/rotation re-snaps the row; that's not the customer scrolling.
    // The window's resize event runs before the browser's scroll events in
    // the same frame (a ResizeObserver only runs after them), so it opens
    // the ignore window in time; the observer then re-bases the position.
    const ignoreResizeScroll = () => {
      ignoreScrollUntilRef.current = performance.now() + 600;
    };
    const resize = new ResizeObserver(() => {
      ignoreResizeScroll();
      lastLeftRef.current = el.scrollLeft;
      updateEdges();
    });
    resize.observe(el);
    window.addEventListener("resize", ignoreResizeScroll, { passive: true });

    const visibility = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        schedule();
      },
      { threshold: [0, 0.35] },
    );
    visibility.observe(el);

    const onVisibility = () => schedule();
    const onFocusIn = () => {
      focusWithinRef.current = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      focusWithinRef.current = el.contains(event.relatedTarget as Node | null);
    };
    // A finger or mouse held on the row: wait, then give a full interval
    // after release so the row never moves under a gesture.
    const onHoldStart = () => {
      holdingRef.current = true;
    };
    const onHoldEnd = () => {
      if (!holdingRef.current) return;
      holdingRef.current = false;
      schedule();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("touchstart", onHoldStart, { passive: true });
    el.addEventListener("pointerdown", onHoldStart, { passive: true });
    window.addEventListener("touchend", onHoldEnd, { passive: true });
    window.addEventListener("touchcancel", onHoldEnd, { passive: true });
    window.addEventListener("pointerup", onHoldEnd, { passive: true });
    window.addEventListener("pointercancel", onHoldEnd, { passive: true });

    // On by default, except for reduced motion (set after mount so the
    // server render and hydration agree).
    if (!prefersReducedMotion()) {
      changeState("playing");
      schedule();
    }

    return () => {
      clearTimer();
      resize.disconnect();
      window.removeEventListener("resize", ignoreResizeScroll);
      visibility.disconnect();
      el.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      el.removeEventListener("touchstart", onHoldStart);
      el.removeEventListener("pointerdown", onHoldStart);
      window.removeEventListener("touchend", onHoldEnd);
      window.removeEventListener("touchcancel", onHoldEnd);
      window.removeEventListener("pointerup", onHoldEnd);
      window.removeEventListener("pointercancel", onHoldEnd);
    };
  }, [changeState, clearTimer, schedule, stopByUser, updateEdges]);

  // Desktop arrows page by whole cards, always landing on a real card edge:
  //   next — the first card that isn't fully visible becomes the first one;
  //   prev — the current first card ends up as the last fully visible one.
  // Positions are measured at click time, so they follow any resize.
  function scrollByPage(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    stopByUser();
    const stops = cardStops();
    const cards = Array.from(el.children as HTMLCollectionOf<HTMLElement>);
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    const current = el.scrollLeft;
    const viewRight = current + el.clientWidth - pad;
    let target: number;
    if (direction > 0) {
      const index = cards.findIndex((card) => card.offsetLeft + card.offsetWidth > viewRight + 1);
      target = index < 0 ? stops[stops.length - 1] : stops[index];
      if (target <= current + 4) target = stops.find((stop) => stop > current + 4) ?? target;
    } else {
      const first = cards.findIndex((card, i) => stops[i] >= current - 4);
      const firstCard = cards[Math.max(first, 0)];
      const wanted = firstCard.offsetLeft + firstCard.offsetWidth - (el.clientWidth - pad);
      target = stops.find((stop) => stop >= wanted - 1) ?? 0;
      if (target >= current - 4) {
        target = [...stops].reverse().find((stop) => stop < current - 4) ?? 0;
      }
    }
    el.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  // Play moves right away (no 5s wait), then continues on the timer.
  // Replay goes back to the first card and starts again.
  function handleControl() {
    if (autoplay === "playing") {
      changeState("paused");
      clearTimer();
      return;
    }
    changeState("playing");
    if (autoplay === "ended") {
      autoScrollTo(0);
      schedule();
      return;
    }
    if (advance()) schedule();
  }

  const controlLabel =
    autoplay === "playing"
      ? "Pause games carousel"
      : autoplay === "ended"
        ? "Replay games carousel"
        : "Play games carousel";

  if (games.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-6 sm:pb-16" aria-labelledby="home-games-heading">
      <div className="flex items-center justify-between gap-4">
        <h2
          id="home-games-heading"
          className="font-heading text-[19px] font-semibold tracking-tight sm:text-2xl"
        >
          Pumili ng Game
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/games"
            className="group text-primary inline-flex min-h-11 items-center gap-1 pr-1 text-sm font-medium"
          >
            <span className="bw-link">Lahat ng games</span>
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
          {(canPrev || canNext) && (
            <>
              <button
                type="button"
                onClick={handleControl}
                aria-label={controlLabel}
                title={controlLabel}
                data-state={autoplay}
                className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-primary inline-flex size-9 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2"
              >
                {autoplay === "playing" ? (
                  <Pause className="size-3.5" />
                ) : autoplay === "ended" ? (
                  <RotateCcw className="size-3.5" />
                ) : (
                  <Play className="size-3.5" />
                )}
              </button>
              <div className="ml-1 hidden items-center gap-1.5 sm:flex">
                <CarouselButton
                  label="Previous games"
                  disabled={!canPrev}
                  onClick={() => scrollByPage(-1)}
                >
                  <ChevronLeft className="size-4" />
                </CarouselButton>
                <CarouselButton
                  label="Next games"
                  disabled={!canNext}
                  onClick={() => scrollByPage(1)}
                >
                  <ChevronRight className="size-4" />
                </CarouselButton>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Phones: bleeds to the screen edges so later cards run off it,
          while scroll padding keeps the first card on the margin.
          Desktop: the viewport matches the content container (4px of room
          for focus rings), so the first card lines up with the heading and
          the last ends on the container's right edge. Only this row
          scrolls sideways; vertical swipes pass to the page. `relative`
          makes each card's offsetLeft relative to the row. */}
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Mga game"
        tabIndex={0}
        className="focus-visible:ring-ring/50 relative -mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-3.5 overflow-x-auto overscroll-x-contain rounded-xl px-5 pt-1 pb-3 outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 sm:-mx-1 sm:mt-5 sm:scroll-px-1 sm:gap-5 sm:px-1 [&::-webkit-scrollbar]:hidden"
      >
        {games.map((game, index) => (
          <div
            key={game.id}
            className="w-[62vw] max-w-[16rem] shrink-0 snap-start sm:w-[248px] sm:max-w-none [&_a]:rounded-xl [&_a]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-primary [&_a:focus-visible]:ring-offset-2 [&_a:focus-visible]:ring-offset-background"
          >
            <GameCard
              game={game}
              productCount={productCounts?.[game.id]}
              priority={index < 2}
              showCategory={false}
              layout="shelf"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function CarouselButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="border-border text-foreground hover:bg-muted focus-visible:ring-primary inline-flex size-9 items-center justify-center rounded-full border transition-[background-color,opacity] outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
