import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import { Badge } from "@/components/ui/badge";
import { robuxViaLinkGameIds, robuxViaLinkTile } from "@/config/robux-via-link";
import { getGamepassesByGameId } from "@/lib/queries/catalog";
import { resolveStoreStatusSafe } from "@/lib/store-status";

export const revalidate = 60;

export const metadata: Metadata = {
  title: robuxViaLinkTile.name,
  description:
    "Buy Robux via link — choose whether Roblox's marketplace tax is covered for you or not.",
};

// Not backed by a single `games` row — this merges two live inventory games
// (Robux Sell — Covered Tax / Robux Sell — No Tax) into one page with two
// sections, so customers pick a tax option once instead of finding two
// near-identical game cards in the catalog. See config/robux-via-link.ts.
export default async function RobuxViaLinkPage() {
  const [coveredTax, notCoveredTax, { status: storeStatus }] = await Promise.all([
    getGamepassesByGameId(robuxViaLinkGameIds.coveredTax),
    getGamepassesByGameId(robuxViaLinkGameIds.notCoveredTax),
    resolveStoreStatusSafe(),
  ]);

  const orderingDisabled = storeStatus !== "open";

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 sm:py-14">
      <nav className="text-muted-foreground flex items-center gap-1.5 text-xs sm:text-sm">
        <Link href="/games" className="hover:text-foreground transition-colors">
          Games
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{robuxViaLinkTile.name}</span>
      </nav>

      <div className="mt-4 flex items-center gap-3.5 sm:gap-6">
        <div
          className="surface-premium relative flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-2xl sm:size-28 sm:rounded-3xl"
          style={{ backgroundColor: `${robuxViaLinkTile.color}1a` }}
        >
          <Image
            src={robuxViaLinkTile.iconUrl}
            alt={robuxViaLinkTile.name}
            fill
            sizes="(min-width: 640px) 112px, 72px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">
            Direct Sale / {coveredTax.length + notCoveredTax.length} products available
          </p>
          <h1 className="font-heading mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-5xl">
            {robuxViaLinkTile.name}
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed sm:text-base">
            Choose from the available Robux packs below.
          </p>
        </div>
      </div>

      <div className="bg-muted/70 text-muted-foreground mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl px-3 py-2 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" />
          No payment on-site
        </span>
        <span aria-hidden>·</span>
        <span>Messenger confirmation</span>
        <span aria-hidden>·</span>
        <span>Delivered to your Roblox username</span>
      </div>

      {/* Explains the two sections before the customer has to guess which
          one applies to them — the whole point of merging these into one
          page instead of two confusingly-similar game cards. */}
      <div className="surface-premium mt-4 grid gap-2 rounded-2xl p-3 sm:grid-cols-2 sm:gap-0 sm:p-4">
        <div className="flex gap-2.5">
          <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
          <div>
            <h2 className="font-heading text-sm font-semibold">Tax Covered</h2>
            <p className="text-muted-foreground mt-1 text-xs leading-snug">
              You receive the listed Robux amount. BudgetWise covers Roblox&apos;s
              marketplace tax.
            </p>
          </div>
        </div>
        <div className="border-border/60 flex gap-2.5 pt-2 sm:border-l sm:pt-0 sm:pl-4">
          <ShieldQuestion className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div>
            <h2 className="font-heading text-sm font-semibold">Tax Not Covered</h2>
            <p className="text-muted-foreground mt-1 text-xs leading-snug">
              Roblox deducts 30%, so{" "}
              <span className="text-foreground font-medium">1,000 Robux</span>{" "}
              delivers{" "}
              <span className="text-foreground font-medium">700 Robux</span>.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-7 sm:mt-10 sm:gap-12">
        <section>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-2xl">
                <ShieldCheck className="text-primary size-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl">
                  Tax Covered
                </h2>
                <Badge variant="secondary" className="mt-1">
                  Recommended
                </Badge>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  Choose an amount where the listed Robux is what you receive.
                </p>
              </div>
            </div>
            <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
              {coveredTax.length} option{coveredTax.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coveredTax.map((gamepass) => (
              <GamepassCard
                key={gamepass.id}
                gamepass={gamepass}
                gameId={robuxViaLinkGameIds.coveredTax}
                gameSlug={robuxViaLinkTile.slug}
                gameName={robuxViaLinkTile.name}
                gameIconUrl={robuxViaLinkTile.iconUrl}
                category="currency"
                orderingDisabled={orderingDisabled}
              />
            ))}
          </div>
        </section>

        <section className="border-border/60 border-t pt-7 sm:pt-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-2xl">
                <ShieldQuestion className="text-primary size-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-3xl">
                  Tax Not Covered
                </h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  Choose a lower-price amount where Roblox deducts its tax.
                </p>
              </div>
            </div>
            <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
              {notCoveredTax.length} option{notCoveredTax.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notCoveredTax.map((gamepass) => (
              <GamepassCard
                key={gamepass.id}
                gamepass={gamepass}
                gameId={robuxViaLinkGameIds.notCoveredTax}
                gameSlug={robuxViaLinkTile.slug}
                gameName={robuxViaLinkTile.name}
                gameIconUrl={robuxViaLinkTile.iconUrl}
                category="currency"
                orderingDisabled={orderingDisabled}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
