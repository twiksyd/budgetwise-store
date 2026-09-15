# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are Roblox players in the Philippines who want to buy gamepasses and in-game currency (Robux) for their own account. They browse the catalog, add items to a cart, and check out on the site with their Roblox username. Copy throughout the site is bilingual (English with Taglish translations via the `Taglish` component), confirming a Filipino audience as a first-class design constraint, not an afterthought.

A small internal team (or solo operator) runs the store day to day through `/admin`: reviewing orders, managing the game/gamepass catalog, syncing Roblox data, and handling order fulfillment manually over Messenger.

## Product Purpose

BudgetWise is a storefront for buying Roblox gamepasses and Robux. It exists to let players get gamepasses/Robux without dealing directly with Roblox's own purchase flow or currency conversion, at a lower price than official channels or other resellers. Success is a completed, correctly delivered order: player finds the item, checks out, gets clear payment instructions, pays via GCash, and receives the gamepass/Robux (or gift) in their Roblox account.

## Positioning

Price is the primary edge — BudgetWise competes on being cheaper than other Roblox gamepass/Robux sellers for the same items. The transparent, order-numbered checkout-then-Messenger-handoff flow (see Operating Context) is the trust mechanism that makes a budget-priced, non-official seller credible, but price is the reason a customer chooses BudgetWise over a competitor in the first place.

## Operating Context

- **Ordering flow (current, not permanent):** browse games → add gamepasses/Robux to cart → checkout with Roblox username, which generates an Order Number and records the order, but does *not* start processing it → customer copies a prepared order message and pastes it into Facebook Messenger → a BudgetWise representative reviews the order and sends official GCash payment instructions → customer pays only after receiving those instructions → payment is verified → the team adds the customer's Roblox account if needed and delivers the gamepass/gift while the customer is available → order is marked Delivered.
- **This manual flow is a current stopgap, not a permanent identity.** Automated payment and/or delivery is a real future direction. Design and copy should support the current manual process well without treating its mechanics (copy-paste order message, "wait for Messenger," manual GCash instructions) as a permanent brand feature to be reinforced indefinitely.
- Payment is GCash only, confirmed manually per order — there is no payment gateway integration today.
- The site explicitly instructs customers not to pay until they receive official payment instructions, framed as fraud/mix-up prevention rather than friction.
- Order history/receipts must survive backend deletion of the live order record — historical order snapshots are treated as permanent, independent of the live order row's lifecycle.
- Admin backend (`/admin`, protected) covers: store operations (open/closed status with a customer-facing notice), catalog layout/health, product asset and artwork management, and Roblox gamepass sync — i.e., the operational surface for running the storefront, separate from the customer-facing shop.
- Official customer contact channel is the BudgetWise Facebook Page (Messenger); a Facebook reviews/vouch post is the current social proof source.

## Capabilities and Constraints

- Core customer-facing surfaces: game/gamepass catalog browsing, cart, checkout (collects Roblox username), order success/confirmation, order-status guidance (How Ordering Works, FAQ, gamepass setup tutorial, refund policy, terms, privacy, contact).
- Core admin surfaces: order/store operations, catalog layout and health monitoring, product asset and artwork recovery tooling, Roblox gamepass catalog sync.
- No automated payment gateway or automated in-game delivery exists yet; both are manual, human-in-the-loop steps today.
- Order snapshots are the durable record: they must remain readable even after the corresponding live order row is deleted from the backend.
- Core functionality (catalog, checkout, order handling, admin operations) is considered built; near-term work is expected to be refinement/polish of the existing product rather than new feature surfaces, unless the user says otherwise for a specific request.

## Brand Commitments

- Name: **BudgetWise**. Slogan (permanent, shown under the name in navbar/footer): "All about delivering value."
- Logo asset at `public/icons/budgetwise-logo.png` (483×221).
- Site copy is bilingual: primary copy in English, with a secondary Taglish (Tagalog-English) translation surfaced via the `Taglish` component — this is a standing content pattern, not a one-off translation.
- Tone in copy is clear, procedural, and reassuring (heavy emphasis on explaining exactly what happens next and why), matching the trust-building role of the ordering flow.

## Evidence on Hand

- Facebook Page is the real, live support/ordering channel (Messenger link uses a real Page ID). A Facebook vouch/reviews post URL is configured as the current social-proof source; no other testimonials, case studies, or press exist and none should be fabricated.
- Logo and several product/banner images already exist under `public/icons/` (e.g. `NOBGbanner-hero.webp`, `robux-plus.png`, `robux-sell.png`) — treat these as real assets, not placeholders.

## Product Principles

- The ordering flow must stay legible and reassuring at every step — this audience is wary of scams in this exact product category, and the checkout-to-Messenger handoff is where trust is won or lost.
- Bilingual (English/Taglish) content is a permanent product trait, not a translation afterthought — new customer-facing copy should be designed with a Taglish counterpart in mind.
- Compete on being visibly the cheaper, still-trustworthy option — pricing and value should read clearly, without looking so bare-bones that it undermines trust.
- Treat the manual Messenger/GCash flow as today's implementation, not tomorrow's ceiling — don't over-invest new craft in mechanics (e.g. copy-paste order messages) that a future automated flow would remove.
- Near-term visual/UX work defaults to refinement of the existing product; propose new surfaces only when explicitly requested.
