import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, HelpCircle, Clock, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Taglish } from "@/components/shared/taglish";
import { getTikTokSupportLink } from "@/lib/support-links";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Order questions go through your Order Chat; general questions can reach us on TikTok.",
};

export default function ContactPage() {
  const supportLink = getTikTokSupportLink();

  return (
    <div className="mx-auto max-w-lg px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Contact us
      </h1>
      <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
        Need help with an order? Use that order&apos;s Order Chat. Have a
        general question? You can reach us on TikTok.
      </p>
      <Taglish size="md">
        May tanong sa order? Sa Order Chat ng order mo kami kausapin. May
        general na tanong? Pwede kaming i-message sa TikTok.
      </Taglish>

      <div className="surface-premium mt-10 rounded-xl p-6 sm:p-7">
        <div className="bg-primary/10 flex size-11 items-center justify-center rounded-xl">
          <MessageCircle className="text-primary size-5" />
        </div>
        <h2 className="font-heading mt-5 text-base font-semibold">
          Questions about an order? Use your Order Chat
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          Payment instructions, your GCash receipt, and every update about an
          order stay in that order&apos;s chat on this website — real answers
          from a real person, not an autoresponder.
        </p>
        <Taglish>
          Lahat ng tungkol sa order — payment instructions, GCash receipt, at
          updates — nasa Order Chat ng order mo. Totoong tao ang sasagot
          sa&apos;yo.
        </Taglish>
        <Button asChild size="lg" className="mt-5 h-11 w-full">
          <Link href="/account/orders">
            <MessageCircle className="size-4" />
            Open My Orders
          </Link>
        </Button>
      </div>

      {supportLink && (
        <div className="surface-premium mt-6 rounded-xl p-6 sm:p-7">
          <h2 className="font-heading text-base font-semibold">
            General questions? Message us on TikTok
          </h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            For questions that aren&apos;t about a specific order. Please
            don&apos;t send your order number, receipt, or payment
            confirmation on TikTok — use your Order Chat so we can match it to
            your order.
          </p>
          <Taglish>
            Para sa general na tanong lang. Huwag ipadala sa TikTok ang order
            number, receipt, o payment confirmation — sa Order Chat lang
            para ma-match namin sa order mo.
          </Taglish>
          <Button asChild variant="outline" size="lg" className="mt-5 h-11 w-full">
            <a href={supportLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" />
              Open TikTok
            </a>
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="surface-premium rounded-xl p-5">
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
            Maliit lang team namin, kaya minsan may konting hintayan. Pero
            lahat ng messages binabasa at sinasagot namin.
          </Taglish>
        </div>
        <div className="surface-premium rounded-xl p-5">
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
            Wala kaming fixed business hours. Chine-check namin yung
            Order Chat throughout the day.
          </Taglish>
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <HelpCircle className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Already have an order?{" "}
            <span className="text-foreground font-medium">
              Write to us in that order&apos;s Order Chat
            </span>{" "}
            — your order number is already attached, so we can find it right
            away. You can find the chat under My Orders. See our{" "}
            <Link href="/faq" className="text-primary hover:underline">
              FAQ
            </Link>{" "}
            for quick answers to common questions.
          </p>
          <Taglish>
            May order ka na? Sa Order Chat nito kami i-message — nakakabit na
            agad ang Order Number kaya mabilis naming mahahanap.
          </Taglish>
        </div>
      </div>
    </div>
  );
}
