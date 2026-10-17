"use client";

import { useLayoutEffect } from "react";

// Nested users (the chat's loading state handing over to the page) share
// one lock: the page underneath is only released when the last one goes.
let locks = 0;
let saved: { html: string; body: string; overscroll: string } | null = null;

/**
 * Keeps --vvh / --vvt (visual viewport height / top offset) on <html> while
 * a full-height messenger is on screen, so the composer stays above the
 * on-screen keyboard and below Safari's address bar, and locks the page
 * underneath: no scrolling, no rubber-banding, nothing behind to reveal.
 * 100dvh alone does not shrink for the iOS keyboard.
 */
export function useVisualViewportVars(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const body = document.body;
    const viewport = window.visualViewport;
    const update = () => {
      root.style.setProperty("--vvh", `${viewport ? viewport.height : window.innerHeight}px`);
      root.style.setProperty("--vvt", `${viewport ? viewport.offsetTop : 0}px`);
    };
    update();
    if (locks++ === 0) {
      saved = { html: root.style.overflow, body: body.style.overflow, overscroll: root.style.overscrollBehavior };
      root.style.overflow = "hidden";
      body.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
    }
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (--locks === 0) {
        root.style.overflow = saved?.html ?? "";
        body.style.overflow = saved?.body ?? "";
        root.style.overscrollBehavior = saved?.overscroll ?? "";
        saved = null;
        root.style.removeProperty("--vvh");
        root.style.removeProperty("--vvt");
      }
    };
  }, [active]);
}
