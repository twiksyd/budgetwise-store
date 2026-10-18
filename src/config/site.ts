import { VOUCH_FACEBOOK_URL } from "@/lib/chat/vouch-request.mjs";

export const siteConfig = {
  name: "BudgetWise",
  logo: { src: "/icons/budgetwise-logo.png", width: 483, height: 221 },
  // The permanent brand slogan — shown under the name in the navbar and
  // footer, not a rotating marketing headline (that's the hero copy).
  slogan: "All about delivering value.",
  description:
    "Premium gamepasses and in-game currencies at competitive prices with a transparent and trusted ordering experience.",
  // Shorter, slogan-led variant specifically for social share cards
  // (Open Graph / Twitter) — the main description above is tuned for
  // search snippets instead.
  ogDescription: "All about delivering value.",
  url: "https://budgetwiseshop.com",
  // m.me accepts a numeric Facebook Page ID directly, which is what this Page
  // uses since it hasn't claimed a custom username (its URL is profile.php?id=...).
  messengerPageId: "61589047545427",
  // TikTok profile used ONLY as a fallback for general questions and support.
  // Orders, order numbers, payment and receipts all stay in the on-site Order
  // Chat. Every "message us on TikTok" link is hidden until this is set,
  // e.g. "https://www.tiktok.com/@yourhandle".
  tiktokUrl: null as string | null,
  // Public Facebook vouch/reviews page. The "View more reviews" button on
  // the homepage is hidden until this is set.
  facebookVouchUrl: VOUCH_FACEBOOK_URL as string | null,
  nav: [
    { label: "Games", href: "/games" },
    { label: "How it works", href: "/how-ordering-works" },
    { label: "My orders", href: "/account/orders" },
  ],
  footerNav: {
    Company: [
      { label: "How ordering works", href: "/how-ordering-works" },
      { label: "Gamepass setup guide", href: "/gamepass-tutorial" },
      { label: "FAQ", href: "/faq" },
      { label: "My orders", href: "/account/orders" },
      { label: "Contact us", href: "/contact" },
    ],
    Legal: [
      { label: "Terms", href: "/terms" },
      { label: "Refund & order policy", href: "/refund-policy" },
      { label: "Privacy policy", href: "/privacy" },
    ],
  },
} as const;
