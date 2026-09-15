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
    <section className="mx-auto max-w-6xl px-6 pt-4 pb-16 sm:pb-28">
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="font-heading max-w-sm text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
      >
        Built like a real storefront, not a middleman.
      </motion.h2>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="divide-border/70 border-border/70 mt-8 grid divide-y border-t sm:mt-12 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {trustPoints.map(({ icon: Icon, title, description }) => (
          <motion.div
            key={title}
            variants={item}
            className="py-5 sm:px-7 sm:py-0 sm:first:pl-0 sm:last:pr-0"
          >
            <Icon className="text-primary size-5" />
            <h3 className="font-heading mt-3 text-base font-semibold">
              {title}
            </h3>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              {description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
