export const siteConfig = {
  name: "BudgetWise",
  tagline: "Premium prices for your favorite games.",
  description:
    "BudgetWise is a premium digital marketplace for discounted in-game currencies, gamepasses, and subscriptions — fast, trustworthy, and built for gamers.",
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
