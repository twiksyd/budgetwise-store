import type { Metadata } from "next";
import Link from "next/link";
import {
  ShoppingCart,
  ClipboardList,
  MessageSquare,
  Clock,
  PackageCheck,
  Info,
  Gamepad2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Taglish } from "@/components/shared/taglish";

export const metadata: Metadata = {
  title: "How ordering works",
  description: "A clear walkthrough of how buying from BudgetWise works.",
};

const steps = [
  {
    icon: ShoppingCart,
    title: "Browse & Select",
    description:
      "Browse the available games and choose the gamepasses or in-game currency you want. Add everything to your cart before proceeding to checkout.",
    taglish:
      "Mamili lang ng gusto mong gamepass o in-game currency, tapos idagdag lahat sa cart bago mag-checkout.",
  },
  {
    icon: ClipboardList,
    title: "Sign in & Checkout",
    description:
      "Sign in with Google (required before checkout — your cart is kept), then fill in the required information, including your Roblox username. The website automatically generates an Order Number and securely records your order.",
    note: "Creating an order does NOT mean it is already being processed.",
    taglish:
      "Mag-sign in gamit ang Google, tapos ilagay yung tamang details at Roblox username mo. Magkakaroon ka agad ng Order Number, pero hindi pa nagsisimula yung order dito.",
  },
  {
    icon: MessageSquare,
    title: "Open Your Order Chat",
    description:
      "After checkout you're taken straight to your Order Chat (/orders/your-order-number). Your order slip is already posted there — there's nothing to copy or paste. You can come back anytime from My Orders (/account/orders); a \"new\" badge means we've replied.",
    taglish:
      "Pagkatapos mag-checkout, dadalhin ka agad sa Order Chat. Nandoon na yung order slip mo, wala nang kokopyahin. Pwede mo itong balikan sa My Orders — ang \"new\" badge ay ibig sabihing may reply kami.",
  },
];

const paymentIncludes = [
  "The correct GCash payment number",
  "Any important payment details",
  "Confirmation that we're ready to process your order",
];

const whyWait = [
  "Ensure payments are sent to the correct account.",
  "Prevent payments from being sent too early.",
  "Keep every order organized.",
  "Begin processing your order immediately after payment verification.",
];

const deliverySteps = [
  "Customer sends payment using our instructions.",
  "Customer uploads the GCash receipt in the Order Chat (JPG, PNG, or WebP, up to 4 MB).",
  "We verify the payment.",
  "If needed, we add the customer's Roblox account.",
  "We send the purchased gamepass or gift while the customer is available.",
  "Once completed, the order is marked as Delivered.",
];

const highlightCard =
  "border-primary/25 bg-primary/[0.05] rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-12px_rgba(0,0,0,0.12)]";

export default function HowOrderingWorksPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        How ordering works
      </h1>
      <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
        Here&apos;s exactly how an order moves from checkout to delivery —
        including the one step most customers miss: waiting for our payment
        instructions before sending any payment.
      </p>
      <Taglish size="md">
        Sundan mo lang yung steps sa baba. Ang pinaka-importante: huwag muna
        magbayad hangga&apos;t wala pa kaming payment instructions sa
        Order Chat.
      </Taglish>

      <div className="mt-12 flex flex-col gap-8">
        {steps.map((step, i) => (
          <div key={step.title} className="flex gap-5">
            <div className="flex flex-col items-center">
              <div className="bg-primary/10 flex size-11 shrink-0 items-center justify-center rounded-xl">
                <step.icon className="text-primary size-5" />
              </div>
              <div className="bg-border/60 mt-2 w-px flex-1" />
            </div>
            <div className="pb-2">
              <p className="text-muted-foreground text-xs font-medium">
                Step {i + 1}
              </p>
              <h2 className="font-heading mt-1 text-base font-semibold">
                {step.title}
              </h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {step.description}
              </p>
              {step.note && (
                <p className="text-foreground mt-1.5 text-sm leading-relaxed font-semibold">
                  {step.note}
                </p>
              )}
              <Taglish>{step.taglish}</Taglish>
            </div>
          </div>
        ))}

        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <div className="bg-primary/15 ring-primary/30 flex size-11 shrink-0 items-center justify-center rounded-xl ring-2">
              <Clock className="text-primary size-5" />
            </div>
            <div className="bg-border/60 mt-2 w-px flex-1" />
          </div>
          <div className="pb-2">
            <p className="text-muted-foreground text-xs font-medium">
              Step 4
            </p>
            <h2 className="font-heading mt-1 text-base font-semibold">
              Wait for Payment Instructions
            </h2>

            <div className={`${highlightCard} mt-3 p-5 sm:p-6`}>
              <div className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                <Info className="size-3.5" />
                Most important step
              </div>
              <p className="text-foreground mt-3 text-sm leading-relaxed">
                After reviewing your order, a BudgetWise representative will
                send you the official payment instructions in your
                Order Chat. This message includes:
              </p>
              <ul className="text-muted-foreground mt-3 flex flex-col gap-1.5 text-sm leading-relaxed">
                {paymentIncludes.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-primary">•</span>
                    {line}
                  </li>
                ))}
              </ul>
              <p className="text-foreground mt-4 text-sm leading-relaxed font-semibold">
                Please do NOT send any payment until you receive our payment
                instructions.
              </p>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                This helps us:
              </p>
              <ul className="text-muted-foreground mt-1.5 flex flex-col gap-1.5 text-sm leading-relaxed">
                {whyWait.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-primary">•</span>
                    {line}
                  </li>
                ))}
              </ul>
              <Taglish className="border-primary/15 mt-4 border-t pt-3">
                Hintayin mo muna yung payment instructions namin sa Order
                Chat. Pag na-send na namin yung payment details, saka ka lang
                magbayad.
              </Taglish>
            </div>
          </div>
        </div>

        <div className="flex gap-5">
          <div className="flex flex-col items-center">
            <div className="bg-primary/10 flex size-11 shrink-0 items-center justify-center rounded-xl">
              <PackageCheck className="text-primary size-5" />
            </div>
          </div>
          <div className="pb-2">
            <p className="text-muted-foreground text-xs font-medium">
              Step 5
            </p>
            <h2 className="font-heading mt-1 text-base font-semibold">
              Payment, Receipt & Delivery
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              After receiving our payment instructions in the chat:
            </p>
            <ul className="text-muted-foreground mt-2 flex flex-col gap-1.5 text-sm leading-relaxed">
              {deliverySteps.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-primary">•</span>
                  {line}
                </li>
              ))}
            </ul>
            <Taglish>
              Pagkabayad, i-upload ang GCash receipt sa Order Chat. Pag
              na-confirm na yung payment mo, aasikasuhin na namin yung
              order hanggang ma-deliver. Kung kailangan ka naming i-add sa
              Roblox, sasabihan ka namin.
            </Taglish>
          </div>
        </div>
      </div>

      <Link
        href="/gamepass-tutorial"
        className="surface-premium surface-premium-hover mt-8 flex items-center gap-3.5 rounded-xl p-5 transition-transform active:scale-[0.99] sm:p-6"
      >
        <div className="bg-primary/10 flex size-11 shrink-0 items-center justify-center rounded-xl">
          <Gamepad2 className="text-primary size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-semibold">
            Need to set up a Roblox gamepass?
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            Follow our step-by-step gamepass setup guide before sending your gamepass link in your Order Chat.
          </p>
        </div>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      </Link>

      <div className="surface-premium mt-8 rounded-xl p-6 text-center sm:p-7">
        <p className="font-heading text-base font-semibold">
          Ready to browse?
        </p>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Pick a game and see what&apos;s available.
        </p>
        <Taglish className="text-center">
          Pumili ng game at tingnan kung ano ang available.
        </Taglish>
        <Button asChild size="lg" className="mt-5 h-11">
          <Link href="/games">Browse games</Link>
        </Button>
      </div>
    </div>
  );
}
