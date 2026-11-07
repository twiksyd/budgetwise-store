"use client";

import { motion, type Variants } from "framer-motion";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";
import { DrawLine, RevealText } from "@/components/motion/reveal";

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Trusted",
    description:
      "Every order gets an order number and a real person on Messenger.",
  },
  {
    icon: Zap,
    title: "Fast",
    description:
      "Orders are picked up quickly once your payment is confirmed.",
  },
  {
    icon: Sparkles,
    title: "Discounted prices",
    description:
      "Lower prices on the gamepasses and Robux you already buy.",
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
    <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-6 sm:pb-24">
      <h2 className="font-heading max-w-sm text-2xl font-semibold tracking-tight text-balance sm:text-4xl">
        <RevealText text="Why BudgetWise" />
      </h2>
      <DrawLine className="bg-border mt-6 block h-px w-full sm:mt-10" />

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
            <Icon className="text-primary size-5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-0.5 group-hover:rotate-[-6deg]" />
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
