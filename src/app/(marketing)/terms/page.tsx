import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { Taglish } from "@/components/shared/taglish";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for the BudgetWise Store.",
};

const sections = [
  {
    title: "What BudgetWise is",
    body: `BudgetWise is an independent digital marketplace that resells discounted in-game currency, gamepasses, and subscriptions. We are not affiliated with, endorsed by, or sponsored by Roblox Corporation or any game publisher whose products are listed on this site.`,
    taglish: `Independent online store kami na nagbebenta ng discounted gamepasses, subscriptions, at in-game currency. Hindi kami affiliated sa Roblox o sa ibang game publishers.`,
  },
  {
    title: "Placing an order",
    body: `An order is created when you complete checkout on this website. You're responsible for providing an accurate Roblox username — delivery is made to the account you provide, and we can't be responsible for delivery to an incorrect account caused by a typo or wrong username at checkout.`,
    taglish: `Siguraduhing tama yung Roblox username mo. Doon namin ibabase yung delivery ng order.`,
  },
  {
    title: "Payment",
    body: `Payment is not collected on this website. After checkout, you'll confirm your order and arrange payment with us directly over Messenger. An order is not fulfilled until payment is confirmed.`,
    taglish: `Sa Messenger lang kami nagbibigay ng payment details. Hindi kami tumatanggap ng payment dito sa website.`,
  },
  {
    title: "Delivery",
    body: `We aim to fulfill confirmed orders promptly, but delivery times can vary with order volume and item availability. If there's a delay on our end, we'll tell you directly rather than leave you waiting without an update.`,
    taglish: `Ginagawa namin ang best namin na ma-deliver agad ang orders. Kung may delay, mag-u-update kami sa Messenger.`,
  },
  {
    title: "Refunds",
    body: `Refunds are handled under our Refund & Order Policy, not this page — see that policy for when a refund applies.`,
    taglish: `Para sa refund rules, pakibasa yung Refund & Order Policy page.`,
  },
  {
    title: "Acceptable use",
    body: `You agree to provide accurate information at checkout and to use BudgetWise for genuine purchases. We reserve the right to decline or cancel an order that appears fraudulent, abusive, or made in bad faith.`,
    taglish: `Pakilagay ang tamang impormasyon at gamitin lang ang website para sa legitimate purchases.`,
  },
  {
    title: "Roblox's own terms",
    body: `Using items purchased through BudgetWise still means you're subject to Roblox's own Terms of Use and Community Standards — we can't override or waive those on your behalf.`,
    taglish: `Kahit dito ka bumili, kailangan mo pa ring sundin ang Terms of Use ng Roblox.`,
  },
  {
    title: "Changes to these terms",
    body: `We may update these terms as the business grows. Continuing to use the site after a change means you accept the current version.`,
    taglish: `Puwede naming i-update ang terms habang lumalaki ang BudgetWise.`,
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Terms
      </h1>
      <p className="text-muted-foreground mt-3 text-sm">
        These terms cover your use of {siteConfig.name}. If anything here is
        unclear, message us before you order.
      </p>
      <Taglish size="md">
        Ito yung mga alituntunin sa paggamit mo ng {siteConfig.name}. May
        tanong ka? I-message mo lang kami bago ka mag-order.
      </Taglish>

      <div className="mt-10 flex flex-col gap-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="font-heading text-base font-semibold">
              {section.title}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {section.body}
            </p>
            <Taglish>{section.taglish}</Taglish>
          </div>
        ))}
      </div>
    </div>
  );
}
