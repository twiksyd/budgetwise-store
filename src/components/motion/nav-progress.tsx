"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/**
 * A thin brand-colour bar at the very top while a page is loading: starts on
 * an internal link click, eases toward 85%, completes when the new route
 * renders. Instant pages finish before it is noticeable.
 */
export function NavProgress() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const started = useRef(0);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || !href.startsWith("/")) return;
      const next = new URL(href, window.location.href);
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      started.current = Date.now();
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    setState((current) => (current === "loading" ? "done" : current));
  }, [pathname]);

  useEffect(() => {
    if (state !== "done") return;
    const timer = window.setTimeout(() => setState("idle"), 420);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (reduce) return null;
  return (
    <AnimatePresence>
      {state !== "idle" && (
        <motion.div
          key="bar"
          className="bw-nav-progress"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={state === "loading" ? { scaleX: 0.85, opacity: 1 } : { scaleX: 1, opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={state === "loading" ? { duration: 2.4, ease: [0.16, 1, 0.3, 1] } : { duration: 0.25, ease: "easeOut" }}
          aria-hidden
        />
      )}
    </AnimatePresence>
  );
}
