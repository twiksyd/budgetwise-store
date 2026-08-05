"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ShoppingCart,
  ClipboardList,
  Send,
  Clock,
  PackageCheck,
  ArrowRight,
} from "lucide-react";

const steps = [
  {
    icon: ShoppingCart,
    title: "Browse & Select",
    description: "Pick your currency or gamepass.",
  },
  {
    icon: ClipboardList,
    title: "Complete Checkout",
    description: "Get your official Order Number.",
  },
  {
    icon: Send,
    title: "Send Prepared Order",
    description: "Messenger opens, ready to send.",
  },
  {
    icon: Clock,
    title: "Wait for Payment Instructions",
    description: "We'll send payment details first.",
  },
  {
    icon: PackageCheck,
    title: "Payment & Delivery",
    description: "Pay, then we deliver fast.",
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function HowItWorksPreview() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 pb-16 sm:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-xl text-center"
      >
        <p className="text-primary text-sm font-medium">How it works</p>
        <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          From cart to delivery, in five steps.
        </h2>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-8 grid grid-cols-1 gap-5 sm:mt-14 sm:grid-cols-2 lg:grid-cols-5"
      >
        {steps.map((step, i) => (
          <motion.div key={step.title} variants={item} className="relative">
            <div className="surface-premium h-full rounded-2xl p-6">
              <p className="text-muted-foreground text-xs font-medium">
                {String(i + 1).padStart(2, "0")}
              </p>
              <div className="bg-primary/10 mt-3 flex size-10 items-center justify-center rounded-xl">
                <step.icon className="text-primary size-5" />
              </div>
              <h3 className="font-heading mt-4 text-sm font-semibold text-balance">
                {step.title}
              </h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-8 text-center">
        <Link
          href="/how-ordering-works"
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          See the full walkthrough
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
