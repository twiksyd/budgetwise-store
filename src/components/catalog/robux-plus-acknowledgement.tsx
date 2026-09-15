"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { robuxPlusPresentation } from "@/config/robux-products";
import { cn } from "@/lib/utils";

let skipNextPlusPageGate = false;

function allowNextPlusPageOpen() {
  skipNextPlusPageGate = true;
}

function consumeNextPlusPageOpenAllowance() {
  const allowed = skipNextPlusPageGate;
  skipNextPlusPageGate = false;
  return allowed;
}

function RobuxPlusNotice({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const reduceMotion = useReducedMotion();
  const sectionVariants: Variants = {
    hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
    show: reduceMotion
      ? { opacity: 1, y: 0 }
      : { opacity: 1, y: 0, transition: { duration: 0.24, ease: "easeOut" } },
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay asChild>
        <motion.div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content
        asChild
        onEscapeKeyDown={onCancel}
        onPointerDownOutside={onCancel}
      >
        <motion.div
          className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh_-_1rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-primary/15 shadow-[0_24px_80px_-30px_rgba(109,40,217,0.45)] outline-none sm:max-h-[calc(100dvh_-_2rem)]"
          initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: reduceMotion ? 0 : 0.24,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: {
                transition: {
                  staggerChildren: reduceMotion ? 0 : 0.055,
                  delayChildren: reduceMotion ? 0 : 0.04,
                },
              },
            }}
          >
            <motion.div
              variants={sectionVariants}
              className="bg-background/95 sticky top-0 z-10 border-b border-border/70 px-3.5 pt-3.5 pb-2.5 text-center backdrop-blur sm:px-5 sm:pt-5 sm:pb-3"
            >
              <p className="border-destructive/25 bg-destructive/10 text-destructive relative mx-auto inline-flex rounded-full border px-3 py-1 text-[11px] font-black tracking-[0.18em] uppercase shadow-sm">
                {robuxPlusPresentation.badge}
              </p>
              <DialogPrimitive.Title className="font-heading relative mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                ROBUX VIA PLUS
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Robux Via Plus is a pre-order with 1-8 hours processing after
                confirmed payment.
              </DialogPrimitive.Description>
            </motion.div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 sm:px-5 sm:py-4">
              <motion.div
                variants={sectionVariants}
                className="border-destructive/25 bg-destructive/8 rounded-2xl border p-3.5 text-center sm:p-5"
              >
                <div className="text-destructive flex items-center justify-center gap-2">
                  <Clock className="size-4" />
                  <p className="text-[11px] font-black tracking-[0.18em] uppercase">
                    Processing Time
                  </p>
                </div>
                <p className="font-heading mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                  1-8 HOURS
                </p>
                <p className="text-destructive/80 mt-1 text-xs font-semibold">
                  after confirmed payment
                </p>

                <div className="border-destructive/15 mt-3 grid gap-2 border-t pt-3 text-left text-sm">
                  <p className="text-muted-foreground leading-relaxed">
                    <strong className="text-foreground font-heading">
                      NOT INSTANT
                    </strong>{" "}
                    — this is a pre-order, not an instant delivery.
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    <strong className="text-foreground font-heading">
                      Refund guarantee
                    </strong>{" "}
                    — not delivered within 8 hours after confirmed payment?
                    We&apos;ll issue a refund for the affected Via Plus
                    order.
                  </p>
                </div>
              </motion.div>

              <motion.label
                variants={sectionVariants}
                className="mt-2.5 flex cursor-pointer items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-sm leading-relaxed transition-colors has-checked:border-primary/40 has-checked:bg-primary/10 sm:mt-3 sm:p-3"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <span>
                  I understand that Robux Via Plus is a{" "}
                  <strong>PRE-ORDER</strong> and may take{" "}
                  <strong>1-8 hours after confirmed payment</strong>.
                </span>
              </motion.label>
            </div>

            <motion.div
              variants={sectionVariants}
              className="bg-background/95 grid shrink-0 gap-2 border-t border-border/70 px-3.5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] backdrop-blur sm:grid-cols-2 sm:px-5 sm:pt-4 sm:pb-5"
            >
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <motion.div
                animate={reduceMotion ? undefined : { scale: checked ? 1 : 0.985 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <Button
                  type="button"
                  onClick={onContinue}
                  disabled={!checked}
                  className={cn(
                    "w-full",
                    checked &&
                      "shadow-[0_12px_28px_-18px_color-mix(in_oklch,var(--primary)_75%,transparent)]",
                  )}
                >
                  I Understand - Continue
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>

          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3"
              onClick={onCancel}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function RobuxPlusAcknowledgementLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function continueToPlus() {
    allowNextPlusPageOpen();
    setOpen(false);
    router.push(href);
  }

  function cancelPlusEntry() {
    setOpen(false);
  }

  return (
    <>
      <Link
        href={href}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Link>
      <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => !nextOpen && cancelPlusEntry()}>
        {open && (
          <RobuxPlusNotice
            onCancel={cancelPlusEntry}
            onContinue={continueToPlus}
          />
        )}
      </DialogPrimitive.Root>
    </>
  );
}

export function RobuxPlusPageGate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!consumeNextPlusPageOpenAllowance()) setOpen(true);
  }, []);

  function continueOnPage() {
    setOpen(false);
  }

  function leavePlusPage() {
    setOpen(false);
    router.replace("/games");
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => !nextOpen && leavePlusPage()}>
      {open && (
        <RobuxPlusNotice
          onCancel={leavePlusPage}
          onContinue={continueOnPage}
        />
      )}
    </DialogPrimitive.Root>
  );
}

export function RobuxPlusPreorderReminder({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-destructive/25 bg-destructive/8 rounded-2xl border px-3.5 py-3 text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="bg-destructive flex size-11 shrink-0 items-center justify-center rounded-2xl text-white">
          <Clock className="size-5" />
        </div>
        <div>
          <p className="text-destructive text-xs font-black tracking-[0.16em] uppercase">
            {robuxPlusPresentation.badge}
          </p>
          <p className="font-heading mt-0.5 text-2xl font-black tracking-tight">
            1-8 HOURS
          </p>
          <p className="text-destructive/80 mt-1 text-xs leading-relaxed">
            Estimated processing after confirmed payment.
          </p>
          <p className="text-destructive/90 mt-2 text-xs leading-relaxed font-medium">
            Not delivered within 8 hours after confirmed payment? We&apos;ll
            issue a refund for the affected Via Plus order.
          </p>
        </div>
      </div>
    </div>
  );
}
