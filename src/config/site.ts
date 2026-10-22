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
  // Messenger destination requested for the website:
  // https://www.facebook.com/messages/t/1016040068270030
  // Use m.me so checkout links can retain their prefilled order messages.
  messengerPageId: "1016040068270030",
  // Public Facebook profile (separate from the Messenger destination).
  facebookPageUrl: "https://www.facebook.com/profile.php?id=61595426676262",
  // Where customers continue an order after checkout:
  //   channel "messenger"  the order-slip page opens Messenger (above) with
  //                        the order message ready to send;
  //   channel "site"       the on-site customer conversation.
  // siteChatSources keeps the on-site conversation for customers from these
  // sources even while channel is "messenger" — e.g. ["tiktok"] (TikTok bio
  // links tagged ?utm_source=tiktok, TikTok's in-app browser, tiktok.com).
  // Empty = everyone goes to Messenger. The on-site chat stays fully built.
  // onSiteChatReadOnly: customers can read their existing on-site chats
  // (history, payment cards, receipts) but not write in them; a notice
  // points them to Messenger. Admins can still reply. Set false when the
  // on-site chat comes back (e.g. for TikTok customers).
  orderHandoff: {
    channel: "messenger" as "messenger" | "site",
    siteChatSources: [] as string[],
    onSiteChatReadOnly: true as boolean,
  },
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
