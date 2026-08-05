import { useEffect, useState } from "react";

// Starts false (SSR-safe — matches nothing until mounted) and updates once
// the real matchMedia result is available. Any component that branches on
// this should be fine with a one-frame "wrong" answer on first mount, since
// that's the tradeoff for not causing a hydration mismatch.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQueryList.addEventListener("change", handler);
    return () => mediaQueryList.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
