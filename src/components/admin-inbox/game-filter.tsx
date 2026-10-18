"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Gamepad2 } from "lucide-react";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import { cn } from "@/lib/utils";

/**
 * Personal game filter (0029). Saved per admin; combines with the Active /
 * Needs reply / Unread / ... tabs. Never assigns anything.
 */
export function GameFilter() {
  const { games, view, setView } = useInbox();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const chosen = new Set(view.games ?? []);
  const allGames = !Array.isArray(view.games);
  const includeInquiries = view.includeInquiries !== false;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const apply = (nextGames: string[] | null, nextInquiries: boolean) =>
    setView({ ...view, games: nextGames, includeInquiries: nextInquiries }, { persist: true });

  const toggleGame = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Nothing chosen and no inquiries would show nothing: back to All games.
    if (next.size === 0 && !includeInquiries) apply(null, true);
    else apply([...next], includeInquiries);
  };

  const label = allGames
    ? "All games"
    : chosen.size === 0
      ? "General Inquiry"
      : chosen.size === 1
        ? (games.find((game) => chosen.has(game.id))?.name ?? "1 game")
        : `${chosen.size} games`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "border-border hover:bg-muted inline-flex h-8 max-w-[12rem] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
          !allGames && "border-primary/40 text-primary",
        )}
        data-testid="game-filter"
      >
        <Gamepad2 className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="bg-background border-border absolute top-full right-0 z-30 mt-1 max-h-80 w-56 overflow-y-auto rounded-xl border p-1 shadow-lg"
        >
          <Option label="All games" selected={allGames && includeInquiries} onClick={() => apply(null, true)} />
          <Option
            label="General Inquiry"
            selected={includeInquiries}
            // From All games, hiding inquiries means "every game, no inquiries".
            onClick={() =>
              allGames ? apply(games.map((game) => game.id), false) : chosen.size === 0 ? apply(null, true) : apply([...chosen], !includeInquiries)
            }
          />
          <div className="border-border/60 my-1 border-t" />
          {games.map((game) => (
            <Option
              key={game.id}
              label={game.name}
              selected={allGames || chosen.has(game.id)}
              // From All games, picking one game narrows to just that game.
              onClick={() => (allGames ? apply([game.id], includeInquiries) : toggleGame(game.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border",
          selected ? "bg-primary border-primary text-primary-foreground" : "border-border",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
