"use client";

import { motion, type Variants } from "framer-motion";
import { ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";

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
    <motion.section
      id="how-it-works"
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-3"
    >
      {trustPoints.map(({ icon: Icon, title, description }) => (
        <motion.div key={title} variants={item}>
          <Card className="glass-surface h-full p-6">
            <Icon className="text-primary size-5" />
            <h3 className="font-heading mt-4 text-base font-semibold">
              {title}
            </h3>
            <p className="text-muted-foreground mt-2 text-sm">
              {description}
            </p>
          </Card>
        </motion.div>
      ))}
    </motion.section>
  );
}
