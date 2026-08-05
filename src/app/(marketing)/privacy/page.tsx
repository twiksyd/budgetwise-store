import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What information BudgetWise collects and how it's used.",
};

const sections = [
  {
    title: "What we collect",
    body: `When you check out, we collect the name and Roblox username you provide — that's what we need to create and deliver your order. Standard technical information (like IP address) may also be collected automatically by our hosting infrastructure, as with any website.`,
  },
  {
    title: "How we use it",
    body: `Your information is used only to process, deliver, and follow up on your order. We don't use it for advertising, and we don't sell it to anyone.`,
  },
  {
    title: "Messenger conversations",
    body: `Once you send your order to us on Messenger, that conversation is also subject to Meta's own privacy policy, since it takes place on their platform rather than ours.`,
  },
  {
    title: "Who we share it with",
    body: `We don't share your information with anyone outside of what's needed to fulfill your own order. We don't sell customer data.`,
  },
  {
    title: "How long we keep it",
    body: `Order records are kept for as long as reasonably needed for business and accounting purposes, such as resolving a dispute or refund request.`,
  },
  {
    title: "Questions about your data",
    body: `Message us any time if you want to know what information we have on file for you, or if you'd like it removed.`,
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

      <div className="mt-10 flex flex-col gap-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="font-heading text-base font-semibold">
              {section.title}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {section.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
