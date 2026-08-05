import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGeneralMessengerLink } from "@/lib/messenger";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get in touch with BudgetWise before or after your order.",
};

export default function ContactPage() {
  const messengerLink = getGeneralMessengerLink();

  return (
    <div className="mx-auto max-w-lg px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Contact us
      </h1>
      <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
        Have a question before you order, or need help with an existing one?
We&apos;re a message away.
      </p>

      <div className="surface-premium mt-10 rounded-2xl p-6 sm:p-7">
        <div className="bg-primary/10 flex size-11 items-center justify-center rounded-xl">
          <MessageCircle className="text-primary size-5" />
        </div>
        <h2 className="font-heading mt-5 text-base font-semibold">
          Message us on Messenger
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          This is how we handle every order and every question — real
          answers from a real person, not an autoresponder.
        </p>
        {messengerLink ? (
          <Button asChild size="lg" className="mt-5 h-11 w-full">
            <a href={messengerLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" />
              Open Messenger
            </a>
          </Button>
        ) : (
          <Button disabled size="lg" className="mt-5 h-11 w-full">
            <MessageCircle className="size-4" />
            Open Messenger
          </Button>
        )}
      </div>

      <div className="mt-8 flex gap-4">
        <HelpCircle className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <p className="text-muted-foreground text-sm leading-relaxed">
          Already have an order?{" "}
          <span className="text-foreground font-medium">
            Include your order number
          </span>{" "}
          when you message us — it&apos;s on your order confirmation page — so we
          can find it right away. See our{" "}
          <Link href="/faq" className="text-primary hover:underline">
            FAQ
          </Link>{" "}
          for quick answers to common questions.
        </p>
      </div>
    </div>
  );
}
