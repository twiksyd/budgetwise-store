"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { ArrowRight, CheckCircle2, Gamepad2, LayoutGrid, Sparkles, TriangleAlert } from "lucide-react";
import type { ProductCardDto } from "@/lib/chat/recommendation.mjs";
import { recommendationHref } from "@/lib/chat/recommendation.mjs";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Who is looking at product cards. The admin view shows what the customer
 * will get plus which order a card led to; links open in a new tab there so
 * the inbox stays put.
 */
export const ProductCardViewerContext = createContext<"customer" | "admin">("customer");

/** Cards sent within this window rise in softly; older ones just render. */
const FRESH_MS = 90_000;

function isFresh(createdAt: string) {
  const at = Date.parse(createdAt);
  return Number.isFinite(at) && Date.now() - at < FRESH_MS;
}

/**
 * A game pricelist or one specific product, sent by BudgetWise (0033).
 * Everything shown is the live catalog (re-read when the chat loads); the
 * link only ever opens BudgetWise's own ordering flow, built from the
 * catalog slug / product id — never a stored URL.
 */
export function ProductRecommendationCard({
  card,
  messageId,
  createdAt,
  isMine,
}: {
  card: ProductCardDto;
  messageId: string;
  createdAt: string;
  isMine: boolean;
}) {
  const viewer = useContext(ProductCardViewerContext);
  const href = recommendationHref(card, messageId);
  const orderable = card.status === "available" && href !== null;
  const isGame = card.type === "game";
  const image = isGame ? card.gameImageUrl : (card.productImageUrl ?? card.gameImageUrl);
  const title = isGame ? card.gameName : (card.productName ?? "Product");
  const external = viewer === "admin";

  const body = (
    <>
      <div className={cn("relative flex gap-3 p-3.5", isGame && "pb-3")}>
        <div
          className={cn(
            "bg-muted relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
            isGame ? "size-16" : "size-[4.5rem]",
          )}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
            <img src={image} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Gamepad2 className="text-muted-foreground size-6" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-primary inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase">
            {isGame ? <LayoutGrid className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
            {isGame ? "Full pricelist" : "Picked for you"}
          </p>
          {!isGame && <p className="text-muted-foreground mt-0.5 truncate text-xs font-medium">{card.gameName}</p>}
          <p className="font-heading mt-0.5 line-clamp-2 text-[15px] leading-snug font-semibold break-words">{title}</p>
          {isGame ? (
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Browse every item and add as many as you like.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {card.price !== null && (
                <span className="font-heading text-lg leading-none font-bold [font-variant-numeric:tabular-nums]">
                  {formatPrice(card.price)}
                </span>
              )}
              {card.robuxAmount ? (
                <span className="text-muted-foreground text-xs [font-variant-numeric:tabular-nums]">
                  {card.robuxAmount.toLocaleString()} Robux
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {card.priceChanged && card.sentPrice !== null && card.status === "available" && (
        <p className="mx-3.5 -mt-1 mb-2.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-100">
          Price updated · was {formatPrice(card.sentPrice)}. Checkout always uses the current price.
        </p>
      )}

      {card.status !== "available" && (
        <p className="text-muted-foreground mx-3.5 mb-2.5 flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {card.status === "removed" ? "No longer available" : "Currently unavailable"}
        </p>
      )}

      {card.orderedAs && (
        <p
          className="mx-3.5 mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200"
          data-testid="product-ordered"
        >
          <CheckCircle2 className="size-3.5" aria-hidden />
          {viewer === "admin" ? `Led to order ${card.orderedAs}` : `Order placed · ${card.orderedAs}`}
        </p>
      )}

      <div className="border-border/60 border-t p-2">
        <span
          className={cn(
            "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-150",
            !orderable
              ? "bg-muted text-muted-foreground"
              : card.orderedAs
                ? "bg-primary/10 text-primary group-hover/card:bg-primary/15"
                : "bg-primary text-primary-foreground group-hover/card:bg-primary/90",
          )}
        >
          {!orderable
            ? isGame
              ? "Pricelist unavailable"
              : "Not available to order"
            : isGame
              ? "Browse pricelist"
              : card.orderedAs
                ? "Order again"
                : "Confirm & order"}
          {orderable && (
            <ArrowRight className="size-4 transition-transform duration-200 group-hover/card:translate-x-0.5" aria-hidden />
          )}
        </span>
      </div>
    </>
  );

  const shell = cn(
    "group/card bg-background text-foreground block w-full max-w-[19rem] overflow-hidden rounded-2xl border text-left shadow-sm",
    orderable ? "border-primary/20 bw-card-lift" : "border-border",
    isFresh(createdAt) && "bw-card-in",
    isMine ? "ml-auto" : "",
  );

  return orderable ? (
    <Link
      href={href}
      className={cn(shell, "focus-visible:ring-ring/50 outline-none focus-visible:ring-3")}
      data-product-card={card.type}
      prefetch={false}
      {...(external ? { target: "_blank", rel: "noopener" } : {})}
      aria-label={`${isGame ? "Browse the pricelist for" : "Order"} ${title}${card.price !== null ? `, ${formatPrice(card.price)}` : ""}`}
    >
      {body}
    </Link>
  ) : (
    <div className={shell} data-product-card={card.type} aria-disabled="true">
      {body}
    </div>
  );
}
