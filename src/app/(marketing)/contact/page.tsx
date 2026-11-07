import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Taglish } from "@/components/shared/taglish";
import { getTikTokSupportLink } from "@/lib/support-links";
import { getGeneralMessengerLink } from "@/lib/messenger";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Message BudgetWise DGM on Messenger for orders, payment, receipts and questions.",
};

export default function ContactPage() {
  const supportLink = getTikTokSupportLink();
  const messengerLink = getGeneralMessengerLink();

  return (
    <div className="mx-auto max-w-lg px-6 py-10 sm:py-20">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Contact us
      </h1>
      <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
        Orders, payment instructions, receipts and questions all go through
        the BudgetWise DGM page on Messenger. A real person replies.
      </p>
      <Taglish size="md">
        Lahat ng tungkol sa order — payment instructions, GCash receipt, at
        updates — sa Messenger chat natin.
      </Taglish>

      {messengerLink && (
        <Button asChild size="lg" className="mt-6 h-11 w-full">
          <a href={messengerLink} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" />
            Message us on Messenger
          </a>
        </Button>
      )}

      <dl className="divide-border/70 border-border/70 mt-10 divide-y border-y text-sm">
        <div className="py-4">
          <dt className="font-heading font-semibold">Already ordered?</dt>
          <dd className="text-muted-foreground mt-1 leading-relaxed">
            Include your order number so we can find it right away.
          </dd>
        </div>
        <div className="py-4">
          <dt className="font-heading font-semibold">Response time</dt>
          <dd className="text-muted-foreground mt-1 leading-relaxed">
            We&apos;re a small team with no fixed hours. Messages are checked
            throughout the day and every one gets an answer.
          </dd>
        </div>
        {supportLink && (
          <div className="py-4">
            <dt className="font-heading font-semibold">TikTok</dt>
            <dd className="text-muted-foreground mt-1 leading-relaxed">
              For general questions only. Please keep order numbers and
              receipts on Messenger.{" "}
              <a
                href={supportLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open TikTok
              </a>
            </dd>
          </div>
        )}
      </dl>

      <p className="text-muted-foreground mt-6 text-sm">
        Quick answers are in the{" "}
        <Link href="/faq" className="text-primary hover:underline">
          FAQ
        </Link>
        .
      </p>
    </div>
  );
}
