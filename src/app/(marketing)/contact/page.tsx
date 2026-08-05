import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, HelpCircle, Clock, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Taglish } from "@/components/shared/taglish";
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
      <Taglish size="md">
        May tanong ka ba bago mag-order, o kailangan ng tulong sa order mo
        na? Isang message lang ang layo namin.
      </Taglish>

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
        <Taglish>
          Dito namin hinahandle ang bawat order at tanong — tunay na tao ang
          sasagot sa iyo, hindi automated.
        </Taglish>
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="surface-premium rounded-2xl p-5">
          <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
            <Timer className="text-primary size-4" />
          </div>
          <p className="font-heading mt-3.5 text-sm font-semibold">
            Response time
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            We&apos;re a small team, so replies aren&apos;t instant — but every
            message gets read and answered by a real person.
          </p>
          <Taglish>
            Maliit na team lang kami kaya hindi laging kaagad ang sagot —
            pero sigurado kaming may tunay na taong babasa at sasagot sa
            mensahe mo.
          </Taglish>
        </div>
        <div className="surface-premium rounded-2xl p-5">
          <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
            <Clock className="text-primary size-4" />
          </div>
          <p className="font-heading mt-3.5 text-sm font-semibold">
            Business hours
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            We don&apos;t keep a fixed schedule — messages are checked
            throughout the day.
          </p>
          <Taglish>
            Walang nakatakdang oras — chine-check namin ang mga mensahe sa
            buong araw.
          </Taglish>
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <HelpCircle className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Already have an order?{" "}
            <span className="text-foreground font-medium">
              Include your order number
            </span>{" "}
            when you message us — it&apos;s on your order confirmation page — so
            we can find it right away. See our{" "}
            <Link href="/faq" className="text-primary hover:underline">
              FAQ
            </Link>{" "}
            for quick answers to common questions.
          </p>
          <Taglish>
            May order ka na ba? Isama ang order number mo kapag nag-message
            ka — makikita ito sa confirmation page ng order mo — para
            mahanap agad namin ito. Tingnan ang aming FAQ para sa mabilisang
            sagot sa mga karaniwang tanong.
          </Taglish>
        </div>
      </div>
    </div>
  );
}
