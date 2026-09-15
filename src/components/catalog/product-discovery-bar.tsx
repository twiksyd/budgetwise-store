"use client";

import { useEffect, useState } from "react";
import { ArrowUp, Search, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CategoryShortcut = {
  id: string;
  label: string;
  count: number;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

// Tracks which section anchor is currently in view so the matching category
// chip can show active/selected feedback while the customer scrolls.
export function useSectionScrollSpy(ids: string[]) {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setActiveId((current) => {
          const visible = entries.filter((entry) => entry.isIntersecting);
          if (visible.length === 0) return current;
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
          );
          return top.target.id;
        });
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);

  return activeId;
}

// True once the given sentinel element has scrolled above the viewport —
// used to reveal the "Back to categories" control on long catalogs only
// after it stops being redundant with the discovery bar itself.
export function useScrolledPast(sentinelId: string) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = document.getElementById(sentinelId);
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setPast(entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelId]);

  return past;
}

export function ProductDiscoveryBar({
  query,
  onQueryChange,
  showSearch,
  categories,
  activeId,
  searchInputId,
  searchLabel = "Search gamepasses/items...",
}: {
  query: string;
  onQueryChange: (value: string) => void;
  showSearch: boolean;
  categories: CategoryShortcut[];
  activeId?: string | null;
  searchInputId: string;
  searchLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {showSearch && (
        <div className="relative">
          <label htmlFor={searchInputId} className="sr-only">
            {searchLabel}
          </label>
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input
            id={searchInputId}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchLabel}
            className="h-11 rounded-full pl-10 pr-10"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1.5 outline-none transition-colors focus-visible:ring-3"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {categories.length > 1 && (
        <nav
          aria-label="Jump to category"
          className="-mx-6 flex gap-2 overflow-x-auto px-6 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((cat) => (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToId(cat.id);
              }}
              aria-current={activeId === cat.id ? "true" : undefined}
              className={cn(
                "focus-visible:ring-ring/50 shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium outline-none transition-all focus-visible:ring-3 sm:text-sm",
                activeId === cat.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background",
              )}
            >
              {cat.label}
              <span className="ml-1.5 opacity-70">{cat.count}</span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

export function BackToCategoriesButton({
  targetId,
  show,
}: {
  targetId: string;
  show: boolean;
}) {
  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => scrollToId(targetId)}
      className="border-border/70 bg-background/95 text-foreground focus-visible:ring-ring/50 fixed bottom-20 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium shadow-lg backdrop-blur-md outline-none transition-colors focus-visible:ring-3 sm:bottom-8 sm:right-8"
    >
      <ArrowUp className="size-3.5" />
      Categories
    </button>
  );
}

export function ProductSearchEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
      <div className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
        <SearchX className="text-primary size-6" />
      </div>
      <p className="font-heading mt-4 text-base font-semibold">
        No matching items found.
      </p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        Try a different search term, or clear your search to see everything.
      </p>
      <Button size="sm" variant="outline" className="mt-5" onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}
