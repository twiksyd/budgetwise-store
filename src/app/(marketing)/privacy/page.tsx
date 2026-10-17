import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { Taglish } from "@/components/shared/taglish";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What information BudgetWise collects and how it's used.",
};

const sections = [
  {
    title: "What we collect",
    body: `When you check out, we collect the name and Roblox username you provide — that's what we need to create and deliver your order. Standard technical information (like IP address) may also be collected automatically by our hosting infrastructure, as with any website.`,
    taglish: `Kinukuha lang namin yung information na kailangan para ma-process at ma-deliver yung order mo.`,
  },
  {
    title: "How we use it",
    body: `Your information is used only to process, deliver, and follow up on your order. We don't use it for advertising, and we don't sell it to anyone.`,
    taglish: `Ginagamit lang namin yung info mo para sa order mo. Hindi namin ito binebenta o ginagamit sa advertising.`,
  },
  {
    title: "Sign-in and Order Chat",
    body: `You sign in with Google, and we store the name and email Google shares so your orders and chats are tied to your account. We never see your Google password. Messages and receipt images you send in an Order Chat are stored with your order, are visible only to you and the BudgetWise team, and are used only to process that order.`,
    taglish: `Google ang gamit sa sign in at hindi namin nakikita ang password mo. Ang mga message at receipt na ipinadala mo sa Order Chat ay nakikita lang ng team at ikaw, at ginagamit lang para sa order mo.`,
  },
  {
    title: "Who we share it with",
    body: `We don't share your information with anyone outside of what's needed to fulfill your own order. We don't sell customer data.`,
    taglish: `Hindi namin sini-share ang information mo maliban kung kailangan para ma-complete ang order mo.`,
  },
  {
    title: "How long we keep it",
    body: `Order records are kept for as long as reasonably needed for business and accounting purposes, such as resolving a dispute or refund request.`,
    taglish: `Iniingatan namin ang order records hangga't kailangan para sa business at customer support.`,
  },
  {
    title: "Questions about your data",
    body: `Contact us any time if you want to know what information we have on file for you, or if you'd like it removed.`,
    taglish: `May tanong tungkol sa data mo? Contact mo lang kami at tutulungan ka namin.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Privacy policy
      </h1>
      <p className="text-muted-foreground mt-3 text-sm">
        How {siteConfig.name} handles the information you share with us.
      </p>
      <Taglish size="md">
        Paano namin inaalagaan yung impormasyon na ibinibigay mo sa amin.
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
