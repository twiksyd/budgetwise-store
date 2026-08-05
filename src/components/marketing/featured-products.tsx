"use client";

import { motion, type Variants } from "framer-motion";
import { FeaturedProductCard } from "@/components/marketing/featured-product-card";
import type { FeaturedGamepass } from "@/lib/queries/catalog";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function FeaturedProducts({
  products,
}: {
  products: FeaturedGamepass[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 sm:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-xl text-center"
      >
        <p className="text-primary text-sm font-medium">Featured products</p>
        <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          A few of our best picks.
        </h2>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-8 grid gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4"
      >
        {products.map((product) => (
          <motion.div key={product.gamepass.id} variants={item}>
            <FeaturedProductCard {...product} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
