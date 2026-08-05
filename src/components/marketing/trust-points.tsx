"use client";

import { motion, type Variants } from "framer-motion";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Taglish } from "@/components/shared/taglish";

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Trustworthy",
    description:
      "Every order is tracked from checkout to delivery — no guesswork, no back-alley deals.",
    taglish:
      "Nasusubaybayan ang bawat order mula checkout hanggang delivery — walang tsamba, walang lihim na deal.",
  },
  {
    icon: Zap,
    title: "Fast",
    description:
      "Orders are picked up and fulfilled quickly, with clear status every step of the way.",
    taglish:
      "Mabilis na pinoproseso ang mga order, may malinaw na status sa bawat hakbang.",
  },
  {
    icon: Sparkles,
    title: "Premium prices",
    description:
      "Discounted rates on the currencies, gamepasses, and subscriptions you already play for.",
    taglish:
      "May diskwento sa currency, gamepasses, at subscriptions na regular mo nang ginagastusan.",
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
        className="mt-8 grid gap-5 sm:mt-14 sm:grid-cols-3"
      >
        {trustPoints.map(({ icon: Icon, title, description, taglish }) => (
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
            <Taglish>{taglish}</Taglish>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
