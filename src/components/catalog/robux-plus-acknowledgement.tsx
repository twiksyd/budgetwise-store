"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Clock, ShieldCheck, X } from "lucide-react";
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
          className="bg-background fixed top-1/2 left-1/2 z-50 max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-primary/15 p-4 shadow-[0_24px_80px_-30px_rgba(109,40,217,0.45)] outline-none sm:p-6"
          initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: reduceMotion ? 0 : 0.24,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <motion.div
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
              className="relative overflow-hidden rounded-3xl border border-primary/15 bg-primary/6 p-3.5 text-center sm:p-4"
            >
              <div className="pointer-events-none absolute inset-x-8 -top-16 h-32 rounded-full bg-primary/15 blur-3xl" />
              <p className="relative mx-auto inline-flex rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-primary uppercase shadow-sm">
                {robuxPlusPresentation.badge}
              </p>
              <DialogPrimitive.Title className="font-heading relative mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                ROBUX VIA PLUS
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Robux Via Plus is a pre-order with 1-8 hours processing after
                confirmed payment.
              </DialogPrimitive.Description>
              <motion.div
                className="relative mt-3 overflow-hidden rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-500/12 via-red-500/7 to-primary/8 px-4 py-3 text-red-950 shadow-[0_18px_36px_-28px_rgba(185,28,28,0.80)] dark:text-red-50 sm:px-5"
                initial={
                  reduceMotion
                    ? false
                    : {
                        scale: 0.985,
                        boxShadow: "0 18px 36px -28px rgba(185,28,28,0.58)",
                      }
                }
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        scale: [0.985, 1.012, 1],
                        boxShadow: [
                          "0 18px 36px -28px rgba(185,28,28,0.58)",
                          "0 18px 44px -22px rgba(185,28,28,0.88)",
                          "0 18px 36px -28px rgba(185,28,28,0.58)",
                        ],
                      }
                }
                transition={{
                  delay: reduceMotion ? 0 : 0.22,
                  duration: reduceMotion ? 0 : 0.58,
                  ease: "easeOut",
                }}
              >
                <motion.div
                  className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={reduceMotion ? undefined : { x: ["0%", "320%"] }}
                  transition={{
                    delay: reduceMotion ? 0 : 0.24,
                    duration: reduceMotion ? 0 : 0.72,
                    ease: "easeOut",
                  }}
                />
                <div className="relative flex items-center justify-center gap-2 text-red-700 dark:text-red-300">
                  <Clock className="size-4" />
                  <p className="text-[11px] font-black tracking-[0.18em] uppercase">
                    Processing Time
                  </p>
                </div>
                <p className="font-heading relative mt-1 text-4xl font-black tracking-tight sm:text-5xl">
                  1-8 HOURS
                </p>
                <p className="relative mt-1 text-xs font-semibold text-red-800 dark:text-red-200">
                  after confirmed payment
                </p>
              </motion.div>
            </motion.div>

            <div className="mt-4 grid gap-3 text-sm">
              <motion.div
                variants={sectionVariants}
                className="rounded-2xl border border-red-500/20 bg-red-500/8 p-3.5"
              >
                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-300" />
                  <div>
                    <p className="font-heading text-base font-black">
                      NOT INSTANT
                    </p>
                    <p className="text-muted-foreground mt-1 leading-relaxed">
                      Your order may take anywhere from 1 to 8 hours to be
                      delivered after your payment has been confirmed.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                variants={sectionVariants}
                className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3.5"
              >
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="font-heading text-base font-black">
                      REFUND GUARANTEE
                    </p>
                    <p className="text-muted-foreground mt-1 leading-relaxed">
                      If your Via Plus Robux is not delivered within 8 hours
                      after confirmed payment, BudgetWise will issue a refund
                      for the affected Via Plus order.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.label
              variants={sectionVariants}
              className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed transition-colors has-checked:border-primary/40 has-checked:bg-primary/10"
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

            <motion.div
              variants={sectionVariants}
              className="mt-5 grid gap-2 sm:grid-cols-2"
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
        "border-red-500/25 bg-red-500/10 text-red-950 dark:text-red-100 rounded-2xl border px-3.5 py-3 text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-700/90 text-white">
          <Clock className="size-5" />
        </div>
        <div>
          <p className="text-xs font-black tracking-[0.16em] text-red-700 uppercase dark:text-red-300">
            {robuxPlusPresentation.badge}
          </p>
          <p className="font-heading mt-0.5 text-2xl font-black tracking-tight">
            1-8 HOURS
          </p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Estimated processing after confirmed payment.
          </p>
          <p className="mt-2 text-xs leading-relaxed font-medium">
            Not delivered within 8 hours after confirmed payment? We&apos;ll
            issue a refund for the affected Via Plus order.
          </p>
        </div>
      </div>
    </div>
  );
}
