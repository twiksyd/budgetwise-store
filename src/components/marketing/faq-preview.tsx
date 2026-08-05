"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqs } from "@/config/faqs";

export function FaqPreview() {
  const preview = faqs.slice(0, 4);

  return (
    <section className="mx-auto max-w-2xl px-6 pb-28 sm:pb-36">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-center"
      >
        <p className="text-primary text-sm font-medium">FAQ</p>
        <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Common questions
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
      >
        <Accordion type="single" collapsible className="mt-10">
          {preview.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger className="font-heading text-left text-[15px] font-semibold">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-[15px] leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-8 text-center">
          <Link
            href="/faq"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            View all FAQs
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
