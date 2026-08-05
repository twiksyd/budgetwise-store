import type { Metadata } from "next";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqs } from "@/config/faqs";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about ordering from BudgetWise.",
};

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Frequently asked questions
      </h1>
      <p className="text-muted-foreground mt-3 text-[15px]">
        Can&apos;t find what you&apos;re looking for?{" "}
        <Link href="/contact" className="text-primary hover:underline">
          Contact us
        </Link>{" "}
        directly.
      </p>

      <Accordion type="single" collapsible className="mt-10">
        {faqs.map((faq) => (
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
    </div>
  );
}
