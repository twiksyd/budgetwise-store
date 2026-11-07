import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SlipPhase = "creating" | "success";

// Line widths for the printed receipt: three item lines, then the total.
const LINES = [
  { width: "78%", delay: "0.6s" },
  { width: "62%", delay: "0.75s" },
  { width: "70%", delay: "0.9s" },
];

// Sits exactly over the checkout form (which stays mounted underneath,
// keeping its size and the customer's entries) while the real order request
// runs. A receipt prints from a slot, its lines appear, then pulse softly
// until the server answers. "success" is only ever set after the server has
// confirmed the order. Plain CSS (see .slip-* in globals.css); reduced
// motion shows the finished receipt, still.
export function OrderSlipCreating({ phase }: { phase: SlipPhase }) {
  const done = phase === "success";

  return (
    <div className="absolute inset-0 isolate flex flex-col items-center justify-center px-4 text-center">
      <div aria-hidden className="relative w-[148px]">
        {/* Soft static purple stage so the white paper reads on a white card. */}
        <div className="bg-primary/[0.07] absolute -inset-x-8 -top-6 -bottom-5 -z-10 rounded-[2rem]" />
        {/* Printer slot */}
        <div className="bg-foreground/90 relative z-10 h-3.5 rounded-full shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)]">
          <div className="bg-background/25 absolute inset-x-3 top-1/2 h-px -translate-y-1/2" />
        </div>
        {/* Paper, clipped by the slot so it appears to feed out of it */}
        <div className="-mt-1.5 overflow-hidden px-3 pb-2">
          <div className="slip-paper bg-card ring-border rounded-b-lg px-3.5 pt-4 pb-3.5 shadow-[0_12px_26px_-12px_rgba(76,29,149,0.35)] ring-1">
            <div className="bg-primary/80 h-1.5 w-10 rounded-full" />
            <div className="mt-3 space-y-2">
              {LINES.map((line) => (
                <div
                  key={line.delay}
                  className={cn("bg-muted-foreground/35 h-1.5 rounded-full", !done && "slip-line")}
                  style={{ width: line.width, ["--slip-delay" as string]: line.delay }}
                />
              ))}
            </div>
            <div className="border-border mt-3 border-t border-dashed pt-2.5">
              <div
                className={cn("bg-primary ml-auto h-2 w-12 rounded-full", !done && "slip-line")}
                style={{ ["--slip-delay" as string]: "1.05s" }}
              />
            </div>
          </div>
        </div>
        {done && (
          <div className="slip-check bg-primary text-primary-foreground absolute -right-1 bottom-0 flex size-9 items-center justify-center rounded-full shadow-lg ring-4 ring-[var(--card)]">
            <Check className="size-5" strokeWidth={3} />
          </div>
        )}
      </div>

      <div role="status" aria-live="polite" className="mt-8">
        <p className="flex items-center justify-center gap-2.5 text-base font-semibold">
          {done ? (
            <Check className="text-primary size-6" aria-hidden strokeWidth={3} />
          ) : (
            <Loader2
              className="text-primary size-6 animate-spin motion-reduce:animate-none"
              strokeWidth={2.5}
              aria-hidden
            />
          )}
          {done ? "Handa na ang order slip" : "Ginagawa ang order slip…"}
        </p>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-[16rem] text-sm text-balance">
          {done ? "Binubuksan na…" : "Sandali lang, inaayos namin ang order mo."}
        </p>
      </div>
    </div>
  );
}
