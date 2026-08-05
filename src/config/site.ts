export const siteConfig = {
  name: "BudgetWise",
  tagline: "Premium prices for your favorite games.",
  description:
    "BudgetWise is a premium digital marketplace for discounted in-game currencies, gamepasses, and subscriptions — fast, trustworthy, and built for gamers.",
  url: "https://budgetwise.shop",
  // m.me accepts a numeric Facebook Page ID directly, which is what this Page
  // uses since it hasn't claimed a custom username (its URL is profile.php?id=...).
  messengerPageId: "61589047545427",
  nav: [
    { label: "Games", href: "/games" },
    { label: "How it works", href: "/#how-it-works" },
  ],
} as const;
