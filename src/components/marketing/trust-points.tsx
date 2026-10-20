"use client";

import { motion, type Variants } from "framer-motion";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";
import { DrawLine, RevealText } from "@/components/motion/reveal";

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
  hidden: { opacity: 0, y: 20, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

export function TrustPoints() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-4 pb-16 sm:pb-28">
      <h2 className="font-heading max-w-sm text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        <RevealText text="Built like a real storefront, not a middleman." />
      </h2>
      <DrawLine className="bg-border mt-8 block h-px w-full sm:mt-12" />

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="divide-border/70 grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        {trustPoints.map(({ icon: Icon, title, description }) => (
          <motion.div
            key={title}
            variants={item}
            className="group py-5 sm:px-7 sm:pt-8 sm:pb-0 sm:first:pl-0 sm:last:pr-0"
          >
            <span className="bg-primary/8 text-primary ring-primary/15 inline-flex size-10 items-center justify-center rounded-lg ring-1 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-0.5 group-hover:rotate-[-4deg]">
              <Icon className="size-5" />
            </span>
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
