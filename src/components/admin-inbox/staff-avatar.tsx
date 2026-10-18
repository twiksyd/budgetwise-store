"use client";

import type { DirectoryEntry } from "@/components/admin-inbox/inbox-provider";
import { cn } from "@/lib/utils";

/**
 * Internal staff avatars for the admin inbox only (never rendered for
 * customers, who always see the BudgetWise logo). There are no staff photos,
 * so each admin gets a letter avatar with a stable tint.
 */
const TINTS = [
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-teal-600 text-white",
  "bg-rose-600 text-white",
  "bg-slate-600 text-white",
];

/** The name admins see for a colleague: public username (Twicks), else the internal name. */
export function staffName(entry: DirectoryEntry | undefined | null, fallback = "Admin") {
  return entry?.publicUsername || entry?.displayName || fallback;
}

function tintFor(key: string) {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function StaffAvatar({
  entry,
  size = "sm",
  className,
}: {
  entry: DirectoryEntry | undefined | null;
  size?: "xs" | "sm";
  className?: string;
}) {
  const name = staffName(entry);
  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        "ring-background inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2",
        size === "xs" ? "size-4 text-[8px]" : "size-5 text-[10px]",
        tintFor(entry?.userId ?? name),
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "A"}
    </span>
  );
}

/** Overlapping avatars for "Viewed by", with the names for screen readers. */
export function StaffAvatarGroup({ entries, max = 3 }: { entries: (DirectoryEntry | undefined)[]; max?: number }) {
  const shown = entries.slice(0, max);
  return (
    <span className="inline-flex items-center -space-x-1">
      {shown.map((entry, index) => (
        <StaffAvatar key={entry?.userId ?? index} entry={entry} size="xs" />
      ))}
    </span>
  );
}
