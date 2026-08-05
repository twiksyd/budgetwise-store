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
    taglish: `Ang BudgetWise ay independiyenteng online store na nagbebenta ng mas mura na in-game currency, gamepasses, at subscriptions. Hindi kami kaugnay o sponsored ng Roblox Corporation o ng ibang game publisher na nasa site na ito.`,
  },
  {
    title: "Placing an order",
    body: `An order is created when you complete checkout on this website. You're responsible for providing an accurate Roblox username — delivery is made to the account you provide, and we can't be responsible for delivery to an incorrect account caused by a typo or wrong username at checkout.`,
    taglish: `Nagagawa ang order kapag natapos mo ang checkout sa website. Responsibilidad mong tama ang Roblox username na ibibigay — doon ide-deliver ang order, at hindi namin masisingil ang mali ang username dahil sa typo o maling paglagay sa checkout.`,
  },
  {
    title: "Payment",
    body: `Payment is not collected on this website. After checkout, you'll confirm your order and arrange payment with us directly over Messenger. An order is not fulfilled until payment is confirmed.`,
    taglish: `Hindi kinokolekta ang bayad dito sa website. Pagkatapos ng checkout, kukumpirmahin mo ang order at pag-uusapan ang bayad sa amin sa Messenger. Hindi maipoproseso ang order hangga't hindi pa kumpirmado ang bayad.`,
  },
  {
    title: "Delivery",
    body: `We aim to fulfill confirmed orders promptly, but delivery times can vary with order volume and item availability. If there's a delay on our end, we'll tell you directly rather than leave you waiting without an update.`,
    taglish: `Sinisikap naming maiproseso agad ang mga kumpirmadong order, pero maaaring magbago ang oras depende sa dami ng order at availability. Kung may delay sa amin, sasabihin namin agad sa iyo.`,
  },
  {
    title: "Refunds",
    body: `Refunds are handled under our Refund & Order Policy, not this page — see that policy for when a refund applies.`,
    taglish: `Ang mga refund ay sakop ng aming Refund & Order Policy, hindi dito — tingnan ang policy na iyon para malaman kung kailan puwede ang refund.`,
  },
  {
    title: "Acceptable use",
    body: `You agree to provide accurate information at checkout and to use BudgetWise for genuine purchases. We reserve the right to decline or cancel an order that appears fraudulent, abusive, or made in bad faith.`,
    taglish: `Sumasang-ayon kang maglagay ng tamang impormasyon sa checkout at gamitin ang BudgetWise para sa tunay na pagbili. May karapatan kaming tumanggi o kanselahin ang order na mukhang peke o may masamang hangarin.`,
  },
  {
    title: "Roblox's own terms",
    body: `Using items purchased through BudgetWise still means you're subject to Roblox's own Terms of Use and Community Standards — we can't override or waive those on your behalf.`,
    taglish: `Kahit bili mo sa BudgetWise ang mga item, sakop ka pa rin ng Terms of Use at Community Standards ng Roblox — hindi namin ito mababago o maiiwasan para sa iyo.`,
  },
  {
    title: "Changes to these terms",
    body: `We may update these terms as the business grows. Continuing to use the site after a change means you accept the current version.`,
    taglish: `Maaari naming i-update ang mga terms na ito habang lumalago ang negosyo. Ang pagpapatuloy mong gamitin ang site pagkatapos ng pagbabago ay nangangahulugang sinang-ayunan mo ang bagong bersyon.`,
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
        Sakop ng mga terms na ito ang paggamit mo sa {siteConfig.name}. Kung
        may hindi malinaw, i-message kami bago ka mag-order.
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
