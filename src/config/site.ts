export const siteConfig = {
  name: "BudgetWise",
  // The permanent brand slogan — shown under the name in the navbar and
  // footer, not a rotating marketing headline (that's the hero copy).
  slogan: "All about delivering value.",
  description:
    "Premium gamepasses and in-game currencies at competitive prices with a transparent and trusted ordering experience.",
  // Shorter, slogan-led variant specifically for social share cards
  // (Open Graph / Twitter) — the main description above is tuned for
  // search snippets instead.
  ogDescription:
    "All about delivering value. Premium gamepasses and in-game currencies at competitive prices.",
  url: "https://budgetwise.shop",
  // m.me accepts a numeric Facebook Page ID directly, which is what this Page
  // uses since it hasn't claimed a custom username (its URL is profile.php?id=...).
  messengerPageId: "61589047545427",
  // Public Facebook vouch/reviews page. The "View more reviews" button on
  // the homepage is hidden until this is set.
  facebookVouchUrl: "https://www.facebook.com/share/p/1Ub2UPFdkv/" as string | null,
  nav: [
    { label: "Games", href: "/games" },
    { label: "How it works", href: "/how-ordering-works" },
  ],
  footerNav: {
    Company: [
      { label: "How ordering works", href: "/how-ordering-works" },
      { label: "Gamepass setup guide", href: "/gamepass-tutorial" },
      { label: "FAQ", href: "/faq" },
      { label: "Contact us", href: "/contact" },
    ],
    Legal: [
      { label: "Terms", href: "/terms" },
      { label: "Refund & order policy", href: "/refund-policy" },
      { label: "Privacy policy", href: "/privacy" },
    ],
  },
} as const;
