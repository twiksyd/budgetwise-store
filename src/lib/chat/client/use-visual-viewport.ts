"use client";

import { useEffect } from "react";

/**
 * Keeps --vvh / --vvt (visual viewport height / top offset) on <html> while
 * a full-height messenger is on screen, so the composer stays above the
 * on-screen keyboard and below Safari's address bar, and locks background
 * scrolling. 100dvh alone does not shrink for the iOS keyboard.
 */
export function useVisualViewportVars(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const update = () => {
      root.style.setProperty("--vvh", `${viewport ? viewport.height : window.innerHeight}px`);
      root.style.setProperty("--vvt", `${viewport ? viewport.offsetTop : 0}px`);
    };
    update();
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.overflow = previousOverflow;
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
    };
  }, [active]);
}
