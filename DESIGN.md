---
name: BudgetWise
description: A polished, price-first storefront for Roblox gamepasses and Robux, built on one signature violet and a rare gold accent.
colors:
  deep-electric-violet: "oklch(0.5 0.223 291)"
  violet-foreground: "oklch(0.985 0 0)"
  honor-gold: "oklch(0.8 0.14 83)"
  honor-gold-foreground: "oklch(0.28 0.06 70)"
  paper: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  cloud: "oklch(0.97 0 0)"
  cloud-foreground: "oklch(0.205 0 0)"
  slate: "oklch(0.556 0 0)"
  hairline: "oklch(0.922 0 0)"
  alert-red: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui"
    fontSize: "clamp(2.25rem, 6vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui"
    fontSize: "clamp(1.875rem, 3vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Sans, ui-sans-serif, system-ui"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  sm: "8px"
  md: "11px"
  lg: "14px"
  xl: "20px"
  2xl: "25px"
  3xl: "31px"
  4xl: "36px"
spacing:
  card-sm: "12px"
  card-md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.deep-electric-violet}"
    textColor: "{colors.violet-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklch, {colors.deep-electric-violet} 90%, transparent)"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.card-sm}"
  badge-primary:
    backgroundColor: "{colors.deep-electric-violet}"
    textColor: "{colors.violet-foreground}"
    rounded: "{rounded.4xl}"
    height: "20px"
  badge-gold:
    backgroundColor: "{colors.honor-gold}"
    textColor: "{colors.honor-gold-foreground}"
    rounded: "{rounded.4xl}"
    height: "20px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "4px 10px"
---

# Design System: BudgetWise

## Overview

**Creative North Star: "The Violet Exchange"**

BudgetWise reads as a polished digital trading counter for game items: price-first, trustworthy, fast, and restrained. One signature color, Deep Electric Violet, carries the brand across every surface — from the price of every item to the primary call to action to the header's focus ring. Honor Gold appears in exactly one place, the Best Value signal, so its rarity keeps doing the work of "this one's worth noticing" instead of decorating.

The mood is polished, approachable, and quietly confident, with just enough warmth to feel right for a young gaming audience rather than corporate. Today's implementation leans into that with rounded cards, soft ambient shadows, a glass-blurred header, and an animated shimmer sweep on the Messenger CTA and the "Best Value" badge — a storefront working hard to look and feel more trustworthy than the resale-market norm. The stated direction for future refinement is to keep that trustworthy, tactile confidence while pulling back on decoration: crisper edges, fewer competing glows, less visual noise, without losing the "premium, not sterile" feeling that makes a budget-priced reseller credible.

**Key Characteristics:**
- One brand color (violet) does almost all the color work; gold is a single, non-repeatable signal.
- Cards and surfaces read as "expensive" through soft shadow and gentle lift, not through heavy borders or bright fills.
- Manrope (headings, prices) paired with Geist Sans (body) — a confident geometric display voice over a quiet, legible body voice.
- Generous corner rounding (14–25px on primary surfaces) throughout; nothing sharp-cornered by default.
- Motion is purposeful and sparse: a staggered hero entrance, a hover lift on cards, a shimmer sweep reserved for the two moments that most need attention (Messenger CTA, Robux Plus preorder badge).

## Colors

Deep Electric Violet is the only color that appears with real frequency; everything else is neutral until a specific status or rarity moment calls for color.

### Primary
- **Deep Electric Violet** (`oklch(0.5 0.223 291)`): the brand color — primary buttons, all prices (`Price` component), links, focus rings, the header's active/hover underline, hero glow gradients, and hover-state shadow tints on cards and buttons. Sampled from the logo crest and nudged warmer than a stock indigo so it reads as "BudgetWise" rather than generic SaaS blue.

### Secondary
- **Honor Gold** (`oklch(0.8 0.14 83)`): reserved exclusively for the single highest-tier signal — the "Best Value" badge, and the border/background tint on that same product's card. Never used as a second general-purpose accent.

### Neutral
- **Paper** (`oklch(1 0 0)`): page background, card and popover surfaces in light mode.
- **Ink** (`oklch(0.145 0 0)`): primary text/foreground in light mode.
- **Cloud** (`oklch(0.97 0 0)`): secondary/muted/accent fill — the one shared "quiet gray" used for secondary buttons, muted backgrounds, and hover fills.
- **Slate** (`oklch(0.556 0 0)`): muted foreground text — captions, metadata, the Taglish caption line.
- **Hairline** (`oklch(0.922 0 0)`): borders and input strokes.
- **Alert Red** (`oklch(0.577 0.245 27.325)`): the one status/destructive color — errors, "Temporarily Closed" state, destructive actions.

Dark mode keeps light mode's neutral discipline but tints surfaces with a whisper of the crest's violet-black (chroma 0.006–0.012) instead of flat gray, so dark mode still reads as "the same world as the logo."

### Named Rules
**The One Signal Rule.** Honor Gold appears in exactly one role (Best Value) at a time. Do not introduce a second gold usage; its scarcity is what makes it legible as "this one is different."

**The Single-Accent Rule.** Outside of status colors (destructive red) and the one gold exception, every accent moment — links, focus, prices, primary buttons, active nav — is the same Deep Electric Violet. Don't introduce a second general-purpose brand hue.

## Typography

**Display / Heading Font:** Manrope (with ui-sans-serif, system-ui fallback)
**Body Font:** Geist Sans (with ui-sans-serif, system-ui fallback)
**Label/Mono Font:** Geist Mono, used only for code-like or tabular contexts, not general labels

**Character:** Manrope's geometric, confident forms carry every heading and every price, giving the storefront its "this is a real, considered product" voice; Geist Sans stays quiet and legible underneath for body copy and Taglish captions, so the display voice never has to compete.

### Hierarchy
- **Display** (600, `clamp(2.25rem, 6vw, 4.5rem)`, tracking −0.03em): the hero h1 only ("Buy gamepasses. Skip overpriced stores.").
- **Headline** (600, `1.875–2.25rem`, tracking −0.02em): page-level h1s (How Ordering Works, FAQ, etc.).
- **Title** (500, `1rem`, snug leading): card titles (product/game names).
- **Body** (400, `15px`, relaxed leading): paragraph copy; Taglish captions run smaller (12–13px) at the same weight and family, muted-foreground colored, directly under their English line.
- **Label** (600, `12px`, tracking `0.06em`, often uppercase): eyebrow text on status badges and section labels.
- **Price** (Manrope, 800/extrabold, tracking −0.03em, tabular-nums): its own voice, distinct from all other type — see the Price component below.

### Named Rules
**The Price Voice Rule.** Every price on the site uses the same extrabold, tabular-numeral treatment in the primary violet — a price should be instantly recognizable as a price before it's read, never styled as plain body or heading text.

## Layout

Content is centered in a `max-w-6xl` (shop/catalog) or `max-w-2xl` (long-form marketing copy: FAQ, policies, how-ordering-works) container with `px-4`–`px-6` side padding. Vertical rhythm is generous on marketing pages (`py-20`–`py-24`) and tighter on shop pages (`py-10`–`py-16`). Product grids use card-based tiling (game grid, gamepass grid) rather than tables. Touch targets grow on mobile and shrink at the `sm:` breakpoint — buttons are `44px` tall by default and step down to `32px` on desktop, because a thumb needs more room than a mouse pointer, not because desktop deserves smaller controls.

## Elevation & Depth

The system is layered, not flat: surfaces lift off the page with soft, diffuse ambient shadow plus a hairline ring, rather than hard borders — the `.surface-premium` treatment (`ring-1 ring-foreground/6`, dual soft shadow) used on every card and elevated tile. Depth increases on interaction: cards lift 2px and their shadow both grows and picks up a tint of the primary violet on hover. The header uses a distinct elevation language — translucency (`backdrop-blur-xl` glass) rather than shadow — to stay grounded to content while scrolling. Buttons pick up a colored glow shadow (violet-tinted) on hover rather than a harder drop shadow, reinforcing the "single accent" rule even in depth cues.

This is the honest snapshot of today's implementation. The confirmed direction for new and refined work is to dial back decorative elevation — fewer stacked glows, less blur-for-its-own-sake — while keeping the core "soft lift on hover, tinted with the brand color" idea, which is load-bearing for the premium feel.

### Shadow Vocabulary
- **Ambient card rest** (`0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -12px rgba(0,0,0,0.12)`): default state for every `.surface-premium` card.
- **Ambient card hover** (`0 1px 2px rgba(0,0,0,0.06), 0 24px 48px -12px color-mix(in oklch, var(--primary) 18%, rgba(0,0,0,0.75))`): hover/lift state — note the violet tint mixed into the shadow itself.
- **Button hover glow** (`0 10px 28px -10px color-mix(in oklch, var(--primary) 55%, transparent)`): primary button hover only.

### Named Rules
**The Tinted Shadow Rule.** Where a shadow signals interactivity (button hover, card hover), mix in the brand violet rather than using a neutral gray shadow — depth and brand identity are the same visual event, not two separate systems.

**The Restraint Direction.** New decorative elevation (extra glow layers, additional blur surfaces, stacked gradients) needs a real reason tied to a specific important moment (see Do's and Don'ts) — it is not the default treatment for an arbitrary new card or section.

## Shapes

Corners are consistently and generously rounded, scaled from one base radius (`14px`): `8px` (chips/small controls), `11px` (compact controls), `14px` (buttons, inputs, base), `20px`, `25px` (primary cards — game cards, product cards), up to `31px`/`36px` for the largest surfaces and full pills (badges use the largest step, `36px`, which at their `20px` height renders as a true capsule). Nothing in the system uses sharp (0px) corners by default. Borders are hairline-weight and low-contrast (`oklch(0.922 0 0)` in light mode, `10% white` in dark mode) — the ring/shadow combination on cards does most of the "this is a distinct surface" work, not a heavy border.

## Components

### Buttons
- **Shape:** `14px` radius (`rounded-lg`), consistent across all variants.
- **Primary:** solid Deep Electric Violet fill, white text, violet-tinted glow shadow on hover. This is the only button variant that carries the brand color as a fill — feels confident and tactile, the clear default action.
- **Hover / Focus:** primary darkens slightly (90% opacity mix) and gains the tinted glow; all variants share a 3px violet focus ring (`focus-visible:ring-ring/50`) for accessibility; active press nudges the button down 1px.
- **Outline / Secondary / Ghost:** outline uses a hairline border on transparent/background fill; secondary uses the neutral Cloud fill; ghost has no resting fill at all, only a hover fill — all three keep violet out of their resting state so the primary button stays the only "this is the action" signal on a screen.
- **Destructive:** low-opacity red fill (`bg-destructive/10`) rather than a solid red block — confident but not alarming, reserved for genuinely destructive admin actions.

### Chips / Badges
- **Style:** full-capsule pill (`36px` radius at `20px` height), tiny icon + label, `12px` label type.
- **State:** default variant carries the primary violet; gold variant (Best Value) is the one exception to the single-accent rule; outline variant is used for informational/neutral states (Coming Soon, Out of Stock).

### Cards / Containers
- **Corner Style:** `25px` (`rounded-2xl`) on product/game cards; `14px` (`rounded-xl`) on nested artwork tiles within a card.
- **Background:** Paper (light) / near-black violet-tinted surface (dark).
- **Shadow Strategy:** see Elevation & Depth — ambient rest state, tinted lift on hover, active-press scale-down (`active:scale-[0.97]`) on tappable cards for mobile feedback.
- **Border:** none; a `1px` hairline-opacity ring (`ring-foreground/6`) substitutes for a border, kept deliberately faint.
- **Internal Padding:** `12px` (compact/currency cards) up to `16px` (standard card padding scale via the `--card-spacing` token).

### Inputs / Fields
- **Style:** hairline border, transparent/background fill, `14px` radius, `32px` height (checkout forms, admin tools).
- **Focus:** border shifts to the violet ring color plus a soft `3px` violet ring glow — same focus language as buttons, so focus always reads as "the same brand, the same signal" regardless of control type.
- **Error / Disabled:** invalid state swaps the ring/border to Alert Red; disabled drops to 50% opacity with a muted fill.

### Navigation
- **Style:** header nav links are plain text (muted-foreground at rest) with an animated underline that grows from 0% to 100% width on hover, in the current text color — no background pill, no color change beyond the text going from muted to full-contrast on hover. Mobile collapses into a sheet/drawer nav. The header itself is a sticky glass surface (`backdrop-blur-xl`, translucent background) rather than a solid bar.

### Price (signature component)
Every price on the site — cart, product card, checkout summary — renders through one component: an extrabold, tightly tracked, tabular-numeral violet numeral with a smaller, baseline-shifted currency symbol (₱) in front. It is deliberately the most visually loud text on any given card, because in a price-first storefront the price is the primary piece of information, not a supporting detail.

### Taglish Caption (signature component)
A short Tagalog/English clarification rendered directly beneath English copy across marketing and transactional pages — same font family as the English above it, muted-foreground colored, ~80–85% of the parent's size, regular weight, no italic, no quote styling. It is treated as a quiet caption, not a translated duplicate, and is a standing content pattern rather than a one-off: any new customer-facing English copy should be authored with a Taglish counterpart in mind.

## Do's and Don'ts

### Do:
- **Do** keep Deep Electric Violet as the only general-purpose accent — prices, primary actions, focus states, and links all share it so the brand reads as one deliberate color, not a palette.
- **Do** keep Honor Gold to exactly one meaning (Best Value) across the whole product.
- **Do** tint interactive shadows with the brand violet (`color-mix(in oklch, var(--primary) …)`) rather than reaching for neutral gray shadows.
- **Do** pair a Taglish caption with new English customer-facing copy, styled per the Taglish Caption component above.
- **Do** keep corners generously rounded (`14px` minimum on any primary surface) — nothing in this system should read as sharp-cornered.

### Don't:
- **Don't** add a second brand hue or a second use for Honor Gold — scarcity is the point of both rules.
- **Don't** stack additional glow, blur, or gradient decoration onto a surface by default; the confirmed direction is toward crisper, calmer surfaces, not more ambient effects. Reserve shimmer/glow treatments for moments that already carry one (the Messenger handoff CTA, the Robux Plus preorder badge) rather than extending the pattern to new elements.
- **Don't** give a secondary/outline/ghost button a colored resting fill — the primary button must stay the only "this is the action" signal on a given screen.
- **Don't** treat the manual Messenger/GCash order flow's current mechanics (copy-paste order message, "wait for Messenger" messaging) as a permanent brand feature to visually reinforce — it is today's implementation, not the system's identity.
