"use client";

import { motion, type Variants } from "framer-motion";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Trustworthy",
    description:
      "Every order is tracked from checkout to delivery — no guesswork, no back-alley deals.",
  },
  {
    icon: Zap,
    title: "Fast",
    description:
      "Orders are picked up and fulfilled quickly, with clear status every step of the way.",
  },
  {
    icon: Sparkles,
    title: "Premium prices",
    description:
      "Discounted rates on the currencies, gamepasses, and subscriptions you already play for.",
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function TrustPoints() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl px-6 pt-4 pb-28 sm:pb-36"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-xl text-center"
      >
        <p className="text-primary text-sm font-medium">Why BudgetWise</p>
        <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Built like a real storefront, not a middleman.
        </h2>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-14 grid gap-5 sm:grid-cols-3"
      >
        {trustPoints.map(({ icon: Icon, title, description }) => (
          <motion.div
            key={title}
            variants={item}
            className="surface-premium surface-premium-hover rounded-2xl p-7"
          >
            <div className="bg-primary/10 flex size-10 items-center justify-center rounded-xl">
              <Icon className="text-primary size-5" />
            </div>
            <h3 className="font-heading mt-5 text-base font-semibold">
              {title}
            </h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
