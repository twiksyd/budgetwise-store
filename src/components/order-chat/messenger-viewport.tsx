"use client";

import { useVisualViewportVars } from "@/lib/chat/client/use-visual-viewport";

/**
 * The order page as a dedicated messaging screen. Phones: an opaque layer
 * over the whole visual viewport (above the keyboard, below Safari's bars)
 * with the page underneath locked — only the message list scrolls.
 * Larger screens: a tall centred column under the site header.
 *
 * Rendered outside the animated route wrapper (see StorefrontChrome): a
 * transformed ancestor would make `fixed` relative to it instead of the
 * screen.
 */
export function MessengerViewport({ children }: { children: React.ReactNode }) {
  useVisualViewportVars(true);
  return (
    <div
      data-messenger-screen
      className="bg-background fixed inset-x-0 top-[var(--vvt,0px)] z-50 flex h-[var(--vvh,100dvh)] flex-col overflow-hidden overscroll-none sm:static sm:z-auto sm:mx-auto sm:my-6 sm:h-[calc(100dvh-8rem)] sm:max-w-2xl sm:rounded-2xl sm:border sm:shadow-sm"
    >
      {children}
    </div>
  );
}
