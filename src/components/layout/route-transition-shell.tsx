"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

type RouteMotionKind = "general" | "catalog" | "forward" | "back" | "cart";

function getRouteDepth(pathname: string) {
  if (pathname === "/") return 0;
  if (pathname === "/games") return 1;
  if (pathname.startsWith("/games/")) return 2;
  if (pathname === "/cart") return 3;
  if (pathname === "/checkout") return 4;
  if (pathname.startsWith("/checkout/")) return 5;
  return 1;
}

function getRouteMotionKind(
  previousPathname: string | null,
  pathname: string,
): RouteMotionKind {
  if (pathname === "/cart") return "cart";
  if (!previousPathname) return "general";
  if (previousPathname === "/" && pathname === "/games") return "catalog";

  const previousDepth = getRouteDepth(previousPathname);
  const nextDepth = getRouteDepth(pathname);

  if (nextDepth < previousDepth) return "back";
  if (nextDepth > previousDepth) return "forward";
  return "general";
}

function getInitialState(kind: RouteMotionKind, reduceMotion: boolean) {
  if (reduceMotion) return { opacity: 0 };

  if (kind === "cart") {
    return { opacity: 0, x: 18, y: 0, scale: 1 };
  }

  if (kind === "catalog") {
    return { opacity: 0, x: 0, y: 14, scale: 0.996 };
  }

  if (kind === "forward") {
    return { opacity: 0, x: 12, y: 0, scale: 0.995 };
  }

  if (kind === "back") {
    return { opacity: 0, x: -10, y: 0, scale: 0.998 };
  }

  return { opacity: 0, x: 0, y: 12, scale: 0.995 };
}

function getExitState(kind: RouteMotionKind, reduceMotion: boolean) {
  if (reduceMotion) return { opacity: 0 };

  if (kind === "cart" || kind === "forward") {
    return { opacity: 0, x: -8, y: 0, scale: 0.995 };
  }

  if (kind === "catalog") {
    return { opacity: 0, x: 0, y: -8, scale: 0.99 };
  }

  if (kind === "back") {
    return { opacity: 0, x: 12, y: 0, scale: 0.998 };
  }

  return { opacity: 0, x: 0, y: -8, scale: 0.992 };
}

export function RouteTransitionShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const previousPathnameRef = useRef<string | null>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const kind = useMemo(
    () => getRouteMotionKind(previousPathnameRef.current, pathname),
    [pathname],
  );

  useEffect(() => {
    previousPathnameRef.current = pathname;
  }, [pathname]);

  return (
    <main className="relative flex-1 overflow-x-clip bg-background">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={pathname}
          initial={getInitialState(kind, reduceMotion)}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={getExitState(kind, reduceMotion)}
          transition={{
            duration: reduceMotion ? 0.08 : kind === "cart" ? 0.24 : 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="min-h-[calc(100dvh-4rem)] bg-background will-change-transform sm:min-h-[calc(100dvh-5rem)]"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
