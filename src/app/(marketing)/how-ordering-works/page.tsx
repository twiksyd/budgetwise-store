import type { Metadata } from "next";
import Link from "next/link";
import {
  ShoppingCart,
  ClipboardList,
  MessageCircle,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How ordering works",
  description: "A clear walkthrough of how buying from BudgetWise works.",
};

const steps = [
  {
    icon: ShoppingCart,
    title: "Browse and add to cart",
    description:
      "Pick a game, choose the currency or gamepass you want, and add it to your cart. Prices are shown up front — no hidden fees.",
  },
  {
    icon: ClipboardList,
    title: "Check out on the site",
    description:
      "Enter your name and Roblox username. This creates a real order with its own order number — the site is the source of truth, not a chat log.",
  },
  {
    icon: MessageCircle,
    title: "Confirm on Messenger",
    description:
      "Your order confirmation page opens Messenger with your order already typed in. Review it and hit send — that's how we know to start on your order and how we arrange payment.",
  },
  {
    icon: PackageCheck,
    title: "We deliver to your account",
    description:
      "Once payment is confirmed, we deliver directly to the Roblox username you provided. If anything needs your attention, we'll reach out on Messenger.",
  },
];

export default function HowOrderingWorksPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        How ordering works
      </h1>
      <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
        The website is where your order is created and tracked. Messenger is
        only used to confirm payment and communicate — never to place the
        order itself.
      </p>

      <div className="mt-12 flex flex-col gap-8">
        {steps.map((step, i) => (
          <div key={step.title} className="flex gap-5">
            <div className="flex flex-col items-center">
              <div className="bg-primary/10 flex size-11 shrink-0 items-center justify-center rounded-xl">
                <step.icon className="text-primary size-5" />
              </div>
              {i < steps.length - 1 && (
                <div className="bg-border/60 mt-2 w-px flex-1" />
              )}
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
            </div>
          </div>
        ))}
      </div>

      <div className="surface-premium mt-12 rounded-2xl p-6 text-center sm:p-7">
        <p className="font-heading text-base font-semibold">
          Ready to browse?
        </p>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Pick a game and see what&apos;s available.
        </p>
        <Button asChild size="lg" className="mt-5 h-11">
          <Link href="/games">Browse games</Link>
        </Button>
      </div>
    </div>
  );
}
