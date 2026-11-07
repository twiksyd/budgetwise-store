"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const steps = [
  { number: 1, label: "Game" },
  { number: 2, label: "Cart" },
  { number: 3, label: "Details" },
  { number: 4, label: "Messenger" },
] as const;

const stepTitles = {
  1: "Pumili ng Game",
  2: "I-add sa Cart",
  3: "Ilagay ang Details",
  4: "I-send sa Messenger",
} as const;

type OrderingStep = 1 | 2 | 3 | 4;

// A slim, single-line progress strip: where the customer is, and how many
// steps are left, without pushing the products below the fold. The four
// segments fill up to the current step; labels sit under them on wider
// screens only.
export function OrderingProgress({
  currentStep,
  title,
  description,
  className,
}: {
  currentStep: OrderingStep;
  title?: string;
  description?: string;
  /** Kept for existing call sites; the strip is always compact now. */
  compact?: boolean;
  className?: string;
}) {
  const currentTitle = title ?? stepTitles[currentStep];

  return (
    <section
      className={cn("w-full", className)}
      aria-label={`Step ${currentStep} of 4 - ${currentTitle}`}
    >
      <p className="flex items-baseline gap-1.5 text-xs">
        <span className="text-primary shrink-0 font-semibold tabular-nums">
          Step {currentStep} of 4
        </span>
        <span aria-hidden className="text-muted-foreground/50">
          ·
        </span>
        <span className="text-muted-foreground truncate font-medium">
          {currentTitle}
        </span>
      </p>

      <ol className="mt-2 grid grid-cols-4 gap-1">
        {steps.map((step) => {
          const reached = step.number <= currentStep;
          const current = step.number === currentStep;

          return (
            <li key={step.number} className="min-w-0" aria-current={current ? "step" : undefined}>
              <div className="bg-muted h-1 overflow-hidden rounded-full">
                {reached && (
                  <motion.div
                    className="bg-primary h-full origin-left rounded-full"
                    initial={{ scaleX: current ? 0 : 1 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                  />
                )}
              </div>
              <span
                className={cn(
                  "mt-1.5 hidden truncate text-[11px] font-medium sm:block",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              <span className="sr-only">
                {step.label}:{" "}
                {step.number < currentStep
                  ? "completed"
                  : current
                    ? "current step"
                    : "future step"}
              </span>
            </li>
          );
        })}
      </ol>

      {description ? (
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed sm:text-sm">
          {description}
        </p>
      ) : null}
    </section>
  );
}
