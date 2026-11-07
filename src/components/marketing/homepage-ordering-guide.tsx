import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const steps = [
  { title: "Pumili ng game", description: "at i-add sa cart ang items na gusto ninyo." },
  { title: "Mag-checkout", description: "gamit ang pangalan at Roblox username. Walang sign-in." },
  { title: "I-send ang order slip", description: "sa BudgetWise DGM sa Messenger." },
  { title: "Hintayin ang payment details", description: "namin sa Messenger bago magbayad." },
];

// Collapsed by default: customers can start shopping right away, and the
// four steps are one tap away for anyone who wants them first.
export function HomepageOrderingGuide() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-6 sm:pb-20">
      <Accordion type="single" collapsible className="surface-premium rounded-xl px-4 sm:px-6">
        <AccordionItem value="paano-umorder" className="border-b-0">
          <AccordionTrigger className="font-heading py-4 text-[15px] font-semibold hover:no-underline">
            Paano Umorder
          </AccordionTrigger>
          <AccordionContent>
            <ol className="grid gap-3 sm:grid-cols-4 sm:gap-5">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3 sm:flex-col sm:gap-1.5">
                  <span className="text-primary font-heading w-4 shrink-0 text-sm font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    <span className="text-foreground font-medium">{step.title}</span>{" "}
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
            <Link
              href="/how-ordering-works"
              className="text-primary group mt-4 inline-flex items-center gap-1 text-sm font-medium"
            >
              <span className="bw-link">Buong ordering guide</span>
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
