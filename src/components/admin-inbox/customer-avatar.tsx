"use client";

import { useState } from "react";
import { identiconSpec, initialsOf, type IdenticonSpec } from "@/lib/chat/customer-avatar.mjs";
import { cn } from "@/lib/utils";

/**
 * Admin inbox only (0029): the customer's Google photo, else a geometric
 * identicon from the opaque seed, else initials. The photo URL was
 * allow-listed on the server (Google's photo host, https); it loads lazily,
 * without a referrer, and a broken image falls back to the identicon.
 */
export function CustomerAvatar({
  name,
  seed,
  photoUrl,
  className,
}: {
  name: string;
  seed: string | null | undefined;
  photoUrl: string | null | undefined;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const spec = identiconSpec(seed);
  const showPhoto = Boolean(photoUrl) && failedUrl !== photoUrl;

  return (
    <span className={cn("relative inline-flex size-10 shrink-0 overflow-hidden rounded-full", className)} aria-hidden>
      {/* The identicon (or initials) is always underneath: a slow or broken
          photo never leaves an empty circle. */}
      {spec ? (
        <Identicon spec={spec} />
      ) : (
        <span className="bg-primary/10 text-primary flex size-full items-center justify-center text-sm font-bold">
          {initialsOf(name)}
        </span>
      )}
      {showPhoto && (
        // A plain <img>: lazy, no referrer, no Next image proxy round trip.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedUrl(photoUrl ?? null)}
        />
      )}
    </span>
  );
}

/** Rendered as SVG elements from numbers and palette colours only (no markup strings). */
function Identicon({ spec }: { spec: IdenticonSpec }) {
  return (
    <svg viewBox="-1 -1 7 7" className="size-full" data-identicon={spec.shape}>
      <rect x={-1} y={-1} width={7} height={7} fill={spec.bg} />
      {spec.cells.map(([x, y]) => {
        const key = `${x}-${y}`;
        switch (spec.shape) {
          case "circle":
            return <circle key={key} cx={x + 0.5} cy={y + 0.5} r={0.46} fill={spec.fg} />;
          case "diamond":
            return <polygon key={key} points={`${x + 0.5},${y} ${x + 1},${y + 0.5} ${x + 0.5},${y + 1} ${x},${y + 0.5}`} fill={spec.fg} />;
          case "triangle":
            return <polygon key={key} points={`${x + 0.5},${y + 0.05} ${x + 0.98},${y + 0.95} ${x + 0.02},${y + 0.95}`} fill={spec.fg} />;
          default:
            return <rect key={key} x={x} y={y} width={1} height={1} fill={spec.fg} />;
        }
      })}
    </svg>
  );
}
