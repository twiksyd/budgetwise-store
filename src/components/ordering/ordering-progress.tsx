"use client";

import { Check } from "lucide-react";
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

export function OrderingProgress({
  currentStep,
  title,
  description,
  compact = false,
}: {
  currentStep: OrderingStep;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const currentTitle = title ?? stepTitles[currentStep];

  return (
    <section
      className={cn(
        "surface-premium rounded-2xl",
        compact ? "p-3 sm:p-3.5" : "p-3.5 sm:p-4",
      )}
      aria-label={`Step ${currentStep} of 4 - ${currentTitle}`}
    >
      <div>
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Step {currentStep} of 4 - {currentTitle}
        </p>
        {description ? (
          <p
            className={cn(
              "text-muted-foreground mt-1 leading-relaxed",
              compact ? "text-xs sm:text-sm" : "text-sm",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>

      <ol className={cn("grid grid-cols-4 gap-1.5 sm:gap-2", compact ? "mt-2" : "mt-3")}>
        {steps.map((step) => {
          const completed = step.number < currentStep;
          const current = step.number === currentStep;

          return (
            <li key={step.number} className="min-w-0">
              <div
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border px-1.5 text-center transition-colors",
                  compact ? "min-h-11 py-1.5 sm:min-h-12" : "min-h-14 py-2",
                  completed &&
                    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  current &&
                    "border-primary/35 bg-primary/10 text-primary",
                  !completed &&
                    !current &&
                    "border-border bg-muted/40 text-muted-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full font-bold",
                    compact ? "size-4 text-[10px]" : "size-5 text-[11px]",
                    completed && "bg-emerald-600 text-white",
                    current && "bg-primary text-primary-foreground",
                    !completed && !current && "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {completed ? <Check className="size-3" /> : step.number}
                </span>
                <span
                  className={cn(
                    "mt-1 leading-tight font-medium",
                    compact ? "text-[10px] sm:text-[11px]" : "text-[11px]",
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">
                  {completed
                    ? "Completed"
                    : current
                      ? "Current step"
                      : "Future step"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
