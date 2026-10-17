"use client";

import { useVisualViewportVars } from "@/lib/chat/client/use-visual-viewport";

/**
 * The order page as a self-contained messenger. Phones: the whole visual
 * viewport (above the keyboard, below Safari's bars). Larger screens: a
 * tall centred column under the site header.
 */
export function MessengerViewport({ children }: { children: React.ReactNode }) {
  useVisualViewportVars(true);
  return (
    <div className="fixed inset-x-0 top-[var(--vvt,0px)] z-40 flex h-[var(--vvh,100dvh)] flex-col sm:static sm:z-auto sm:mx-auto sm:my-6 sm:h-[calc(100dvh-8rem)] sm:max-w-2xl sm:overflow-hidden sm:rounded-2xl sm:border sm:shadow-sm">
      {children}
    </div>
  );
}
