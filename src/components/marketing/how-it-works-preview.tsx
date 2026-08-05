"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardList } from "lucide-react";

// A condensed teaser, not a duplicate of the dedicated How Ordering
// Works page — the full 5-step walkthrough (including the payment-
// instructions step most customers miss) lives there, in one place.
export function HowItWorksPreview() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 pb-16 sm:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="surface-premium surface-premium-hover mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-3xl p-8 text-center sm:p-12"
      >
        <div className="bg-primary/10 flex size-14 items-center justify-center rounded-2xl">
          <ClipboardList className="text-primary size-6" />
        </div>
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          How Ordering Works
        </h2>
        <p className="text-muted-foreground max-w-md text-base leading-relaxed">
          Understand exactly how ordering, payment, and delivery work before
          placing an order.
        </p>
        <Link
          href="/how-ordering-works"
          className="text-primary mt-2 inline-flex items-center gap-1.5 text-base font-semibold hover:underline"
        >
          Learn How It Works
          <ArrowRight className="size-4" />
        </Link>
      </motion.div>
    </section>
  );
}
