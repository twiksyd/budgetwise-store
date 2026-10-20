"use client";

import { useEffect } from "react";

/**
 * One pointer listener for the whole page: the tile under the pointer gets
 * --mx / --my (pointer position inside it), which the .surface-premium-hover
 * spotlight and border glow follow. Mouse / pen only — touch has no hover.
 */
export function SpotlightTracker() {
  useEffect(() => {
    let frame = 0;
    let last: { el: HTMLElement; x: number; y: number } | null = null;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const el = (event.target as Element | null)?.closest?.<HTMLElement>(".surface-premium-hover");
      if (!el) return;
      last = { el, x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!last) return;
        const rect = last.el.getBoundingClientRect();
        last.el.style.setProperty("--mx", `${last.x - rect.left}px`);
        last.el.style.setProperty("--my", `${last.y - rect.top}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
