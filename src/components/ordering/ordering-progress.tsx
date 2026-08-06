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
}: {
  currentStep: OrderingStep;
  title?: string;
  description?: string;
}) {
  const currentTitle = title ?? stepTitles[currentStep];

  return (
    <section
      className="surface-premium rounded-2xl p-3.5 sm:p-4"
      aria-label={`Step ${currentStep} of 4 - ${currentTitle}`}
    >
      <div>
        <p className="text-primary text-xs font-semibold tracking-wide uppercase">
          Step {currentStep} of 4 - {currentTitle}
        </p>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>

      <ol className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2">
        {steps.map((step) => {
          const completed = step.number < currentStep;
          const current = step.number === currentStep;

          return (
            <li key={step.number} className="min-w-0">
              <div
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center transition-colors",
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
                    "flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                    completed && "bg-emerald-600 text-white",
                    current && "bg-primary text-primary-foreground",
                    !completed && !current && "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {completed ? <Check className="size-3" /> : step.number}
                </span>
                <span className="mt-1 text-[11px] leading-tight font-medium">
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
