"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CopyCheck,
  MessageCircle,
  RotateCcw,
  TriangleAlert,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Taglish } from "@/components/shared/taglish";
import { ScreenshotLightbox } from "@/components/gamepass-tutorial/screenshot-lightbox";
import { gamepassTutorialStages, isTallScreenshot } from "@/config/gamepass-tutorial";
import { cn } from "@/lib/utils";

type LightboxImage = { src: string; alt: string; width: number; height: number };

const STORAGE_KEY = "budgetwise:gamepass-tutorial:v1";

type StoredProgress = {
  stageIndex: number;
  stepIndex: number;
  completedStages: number[];
  finished: boolean;
};

const defaultProgress: StoredProgress = {
  stageIndex: 0,
  stepIndex: 0,
  completedStages: [],
  finished: false,
};

function loadProgress(): StoredProgress {
  if (typeof window === "undefined") return defaultProgress;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress;
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    const stageIndex = Math.min(
      Math.max(parsed.stageIndex ?? 0, 0),
      gamepassTutorialStages.length - 1,
    );
    const stepIndex = Math.min(
      Math.max(parsed.stepIndex ?? 0, 0),
      gamepassTutorialStages[stageIndex].steps.length - 1,
    );
    return {
      stageIndex,
      stepIndex,
      completedStages: Array.isArray(parsed.completedStages)
        ? parsed.completedStages
        : [],
      finished: parsed.finished ?? false,
    };
  } catch {
    return defaultProgress;
  }
}

export function GamepassTutorialClient({
  initialPrice,
  messengerLink,
}: {
  initialPrice: string | null;
  messengerLink: string | null;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [progress, setProgress] = useState<StoredProgress>(defaultProgress);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const [copied, setCopied] = useState(false);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress, hydrated]);

  const totalStages = gamepassTutorialStages.length;
  const stage = gamepassTutorialStages[progress.stageIndex];
  const step = stage.steps[progress.stepIndex];
  const isLastStepOfStage = progress.stepIndex === stage.steps.length - 1;
  const isVeryLastStep =
    progress.stageIndex === totalStages - 1 && isLastStepOfStage;

  const openLightbox = useCallback((image: LightboxImage) => {
    setLightboxImage(image);
  }, []);

  const goNext = useCallback(() => {
    setShowNote(false);
    setProgress((prev) => {
      const currentStage = gamepassTutorialStages[prev.stageIndex];
      const atLastStep = prev.stepIndex === currentStage.steps.length - 1;

      if (!atLastStep) {
        return { ...prev, stepIndex: prev.stepIndex + 1 };
      }

      const completedStages = prev.completedStages.includes(prev.stageIndex)
        ? prev.completedStages
        : [...prev.completedStages, prev.stageIndex];

      const atLastStage = prev.stageIndex === totalStages - 1;
      if (atLastStage) {
        return { ...prev, completedStages, finished: true };
      }

      return {
        ...prev,
        stageIndex: prev.stageIndex + 1,
        stepIndex: 0,
        completedStages,
      };
    });
  }, [totalStages]);

  const goBack = useCallback(() => {
    setShowNote(false);
    setProgress((prev) => {
      if (prev.stepIndex > 0) {
        return { ...prev, stepIndex: prev.stepIndex - 1 };
      }
      if (prev.stageIndex === 0) return prev;
      const prevStage = gamepassTutorialStages[prev.stageIndex - 1];
      return {
        ...prev,
        stageIndex: prev.stageIndex - 1,
        stepIndex: prevStage.steps.length - 1,
      };
    });
  }, []);

  const jumpToStage = useCallback((stageIndex: number) => {
    setShowNote(false);
    setProgress((prev) => ({
      ...prev,
      stageIndex,
      stepIndex: 0,
      finished: false,
    }));
  }, []);

  const restart = useCallback(() => {
    setShowNote(false);
    setProgress(defaultProgress);
  }, []);

  const copyPrice = useCallback(async () => {
    if (!initialPrice) return;
    try {
      await navigator.clipboard.writeText(initialPrice);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can fail silently (permissions, insecure context);
      // the price is still visible on screen for manual entry.
    }
  }, [initialPrice]);

  const stepKey = `${progress.stageIndex}-${progress.stepIndex}`;
  const isPriceStage = stage.id === "price";
  const isFinalPriceStep = isPriceStage && isLastStepOfStage;

  const checklist = useMemo(
    () => [
      "Experience is Public",
      "Gamepass is for sale",
      "Price is correct",
      "Managed Pricing is OFF",
    ],
    [],
  );

  if (!hydrated) {
    return <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24" />;
  }

  if (progress.finished) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="surface-premium rounded-2xl p-6 text-center sm:p-8"
        >
          <div className="bg-primary/10 mx-auto flex size-14 items-center justify-center rounded-2xl text-3xl">
            🎉
          </div>
          <h1 className="font-heading mt-5 text-2xl font-semibold tracking-tight">
            You&apos;re Done!
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Your Roblox gamepass should now be ready. Before messaging us,
            double-check:
          </p>
          <ul className="mt-5 flex flex-col gap-2.5 text-left">
            {checklist.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm">
                <span className="bg-primary/15 flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="text-primary size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Taglish className="mt-4 text-center">
            Siguraduhin: Public na yung experience, naka-sale na yung
            gamepass, tama ang price, at naka-OFF ang Managed Pricing.
          </Taglish>

          {messengerLink ? (
            <Button asChild size="lg" className="mt-6 h-11 w-full">
              <a href={messengerLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" />
                Message BudgetWise
              </a>
            </Button>
          ) : (
            <Button disabled size="lg" className="mt-6 h-11 w-full">
              <MessageCircle className="size-4" />
              Message BudgetWise
            </Button>
          )}
          <Button asChild variant="outline" size="lg" className="mt-2.5 h-11 w-full">
            <Link href="/games">Back to Store</Link>
          </Button>
          <button
            type="button"
            onClick={restart}
            className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <RotateCcw className="size-3.5" />
            Restart tutorial
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            How to Set Up Your Roblox Gamepass
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Follow these steps before sending your gamepass link to
            BudgetWise.
          </p>
        </div>
        {messengerLink && (
          <a
            href={messengerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary hidden shrink-0 items-center gap-1 text-xs font-medium transition-colors sm:inline-flex"
          >
            <MessageCircle className="size-3.5" />
            Need help?
          </a>
        )}
      </div>
      <Taglish size="md">
        Sundan ang mga hakbang na ito bago mo ipadala ang link ng gamepass mo
        sa BudgetWise.
      </Taglish>

      {/* Stage stepper */}
      <div className="mt-8 flex items-center" role="list" aria-label="Tutorial stages">
        {gamepassTutorialStages.map((s, i) => {
          const isCompleted = progress.completedStages.includes(i);
          const isCurrent = i === progress.stageIndex;
          return (
            <div key={s.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                role="listitem"
                onClick={() => jumpToStage(i)}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`${s.label}${isCompleted ? " (completed)" : ""}`}
                className="group flex flex-col items-center gap-1.5 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors sm:size-9",
                    isCurrent &&
                      "border-primary bg-primary text-primary-foreground",
                    isCompleted &&
                      !isCurrent &&
                      "border-primary/40 bg-primary/15 text-primary",
                    !isCurrent &&
                      !isCompleted &&
                      "border-border bg-background text-muted-foreground group-hover:border-primary/40",
                    "group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                  )}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="size-4" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "hidden text-[10px] font-medium sm:block",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < totalStages - 1 && (
                <div
                  className={cn(
                    "mx-1 h-px flex-1 transition-colors sm:mx-1.5",
                    isCompleted ? "bg-primary/40" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step viewer */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stepKey}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="surface-premium mt-6 overflow-hidden rounded-2xl"
        >
          <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">
              Stage {progress.stageIndex + 1} of {totalStages} &middot;{" "}
              {stage.title}
            </p>
            {stage.steps.length > 1 && (
              <p className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
                {progress.stepIndex + 1} / {stage.steps.length}
              </p>
            )}
          </div>

          {progress.stepIndex === 0 && stage.intro && (
            <p className="text-muted-foreground px-5 pt-2 text-sm leading-relaxed sm:px-6">
              {stage.intro}
            </p>
          )}

          {isPriceStage && (
            <div className="px-5 pt-4 sm:px-6">
              <ManagedPricingWarning compact={!isFinalPriceStep} />
            </div>
          )}

          <div className="px-5 pt-4 sm:px-6">
            <TutorialImage
              src={step.image}
              width={step.imageWidth}
              height={step.imageHeight}
              alt={step.alt}
              onEnlarge={() =>
                openLightbox({
                  src: step.image,
                  alt: step.alt,
                  width: step.imageWidth,
                  height: step.imageHeight,
                })
              }
              priority
            />
          </div>

          <div className="p-5 sm:p-6">
            <p className="text-foreground text-[15px] leading-relaxed font-medium">
              {step.instruction}
            </p>
            {step.taglish && <Taglish size="md">{step.taglish}</Taglish>}

            {isFinalPriceStep && (
              <PriceAssistance
                price={initialPrice}
                copied={copied}
                onCopy={copyPrice}
              />
            )}

            {step.note && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowNote((v) => !v)}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline"
                >
                  {step.note.title}
                </button>
                {showNote && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.18 }}
                    className="bg-muted/50 mt-2 overflow-hidden rounded-xl p-4"
                  >
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {step.note.body}
                    </p>
                    {step.note.image &&
                      step.note.imageWidth &&
                      step.note.imageHeight && (
                        <div className="mt-3">
                          <TutorialImage
                            src={step.note.image}
                            width={step.note.imageWidth}
                            height={step.note.imageHeight}
                            alt={step.note.imageAlt ?? step.note.title}
                            onEnlarge={() =>
                              openLightbox({
                                src: step.note!.image!,
                                alt: step.note!.imageAlt ?? step.note!.title,
                                width: step.note!.imageWidth!,
                                height: step.note!.imageHeight!,
                              })
                            }
                            variant="note"
                          />
                        </div>
                      )}
                  </motion.div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-border/60 p-5 sm:p-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 flex-1"
              onClick={goBack}
              disabled={progress.stageIndex === 0 && progress.stepIndex === 0}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-11 flex-1"
              onClick={goNext}
            >
              {isVeryLastStep ? "Done" : "Done — Next"}
              {!isVeryLastStep && <ChevronRight className="size-4" />}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={restart}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <RotateCcw className="size-3.5" />
          Restart tutorial
        </button>
        {messengerLink && (
          <a
            href={messengerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 text-xs font-medium transition-colors sm:hidden"
          >
            <MessageCircle className="size-3.5" />
            Need help?
          </a>
        )}
      </div>

      <ScreenshotLightbox
        image={lightboxImage}
        open={lightboxImage !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxImage(null);
        }}
      />
    </div>
  );
}

// A consistent "photo frame" (neutral background, rounded corners, subtle
// border, small padding) around every screenshot regardless of its native
// aspect ratio. The inner box uses the image's real aspect-ratio, capped by
// a viewport-relative max-height — landscape/near-square shots render edge
// to edge, portrait ones shrink to fit the cap and letterbox inside the
// frame rather than stretching the whole card tall.
function TutorialImage({
  src,
  width,
  height,
  alt,
  onEnlarge,
  variant = "primary",
  priority,
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  onEnlarge: () => void;
  variant?: "primary" | "note";
  priority?: boolean;
}) {
  const tall = isTallScreenshot(width, height);
  return (
    <button
      type="button"
      onClick={onEnlarge}
      aria-label={`Enlarge screenshot: ${alt}`}
      className={cn(
        "group border-border/60 bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 relative block w-full overflow-hidden rounded-xl border focus-visible:outline-none",
        variant === "primary" ? "p-2" : "p-1.5",
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg",
          variant === "primary"
            ? "max-h-[42vh] sm:max-h-[48vh] md:max-h-[55vh]"
            : "max-h-[26vh]",
        )}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={
            variant === "primary"
              ? "(min-width: 640px) 620px, 100vw"
              : "(min-width: 640px) 380px, 90vw"
          }
          className="object-contain"
          priority={priority}
        />
      </div>
      <span className="bg-black/60 text-white opacity-90 backdrop-blur-sm transition-opacity group-hover:opacity-100 absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full">
        <ZoomIn className="size-4" />
      </span>
      {tall && variant === "primary" && (
        <span className="bg-black/60 text-white absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
          Tap to enlarge
        </span>
      )}
    </button>
  );
}

function ManagedPricingWarning({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <div className="border-amber-500/30 bg-amber-500/10 flex items-center gap-2.5 rounded-xl border px-4 py-3">
        <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-foreground text-xs leading-snug">
          Reminder: when you set your price, keep{" "}
          <span className="font-semibold">Managed Pricing OFF</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="border-amber-500/30 bg-amber-500/10 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-foreground text-sm font-semibold">Important</p>
      </div>
      <p className="text-foreground mt-1.5 text-sm leading-relaxed">
        Keep <span className="font-semibold">Managed Pricing OFF</span>.
      </p>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        Do not enable Managed Pricing when creating the pass for your
        BudgetWise order — it can change your price automatically.
      </p>
    </div>
  );
}

function PriceAssistance({
  price,
  copied,
  onCopy,
}: {
  price: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!price) {
    return (
      <div className="bg-muted/50 mt-4 rounded-xl p-4">
        <p className="text-muted-foreground text-xs leading-relaxed">
          Use the gamepass price provided in your BudgetWise order or
          instructions.
        </p>
      </div>
    );
  }

  return (
    <div className="border-primary/25 bg-primary/[0.05] mt-4 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Your Gamepass Price
      </p>
      <p className="font-heading text-foreground mt-1 text-2xl font-semibold">
        {price} <span className="text-muted-foreground text-base font-normal">R$</span>
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Enter exactly: <span className="text-foreground font-medium">{price}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 h-11 w-full sm:h-8"
        onClick={onCopy}
      >
        {copied ? (
          <>
            <CopyCheck className="size-3.5" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" />
            Copy Price
          </>
        )}
      </Button>
    </div>
  );
}
